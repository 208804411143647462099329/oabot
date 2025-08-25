const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { OpenAI } = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Stripe = require('stripe');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const vision = require('@google-cloud/vision');

const app = express();
const PORT = process.env.PORT || 3000;
const upload = multer({ storage: multer.memoryStorage() });

// Configurações
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Inicializar serviços
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
});

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Cache de respostas
const responseCache = new Map();

// ========== ROTAS PRINCIPAIS ==========

app.get('/', (req, res) => {
  res.json({ 
    status: 'online',
    service: 'OABOT API v3.0',
    features: [
      'Multi-AI (OpenAI, Claude, Gemini)',
      'Supabase Database',
      'Stripe Payments',
      'Document Processing',
      'Image Analysis',
      'Response Caching'
    ],
    timestamp: new Date()
  });
});

// ========== CHAT COM MÚLTIPLAS IAS ==========
app.post('/chat', async (req, res) => {
  try {
    const { message, email, model = 'gpt-4o-mini', useCache = true } = req.body;
    
    // Verificar cache
    const cacheKey = `${model}:${message.substring(0, 50)}`;
    if (useCache && responseCache.has(cacheKey)) {
      return res.json({ 
        response: responseCache.get(cacheKey),
        cached: true,
        credits_remaining: 5
      });
    }
    
    // Verificar créditos no Supabase
    const { data: user } = await supabase
      .from('profiles')
      .select('credits, plan')
      .eq('email', email)
      .single();
    
    if (!user || user.credits <= 0) {
      return res.status(403).json({ 
        error: 'Sem créditos disponíveis',
        upgrade_url: '/pricing'
      });
    }
    
    // Prompt especializado para OAB
    const systemPrompt = `Você é o OABOT, especialista em segunda fase penal do Exame de Ordem.
    
    FOCO PRINCIPAL:
    1. Habeas Corpus (Art. 647-667 CPP)
    2. Apelação (Art. 593-603 CPP)
    3. Recurso em Sentido Estrito - RESE (Art. 581-592 CPP)
    4. Resposta à Acusação (Art. 396-A CPP)
    
    SEMPRE:
    - Cite artigos específicos do CPP e CF
    - Use jurisprudência do STF e STJ
    - Estruture as peças com clareza
    - Indique prazos processuais`;
    
    let response = '';
    
    // Escolher IA baseado no modelo
    switch(model) {
      case 'claude-3':
        const claudeResponse = await anthropic.messages.create({
          model: 'claude-3-opus-20240229',
          max_tokens: 1000,
          messages: [
            { role: 'user', content: message }
          ],
          system: systemPrompt
        });
        response = claudeResponse.content[0].text;
        break;
        
      case 'gemini':
        const geminiModel = genAI.getGenerativeModel({ model: 'gemini-pro' });
        const geminiResult = await geminiModel.generateContent(
          systemPrompt + '\n\nUsuário: ' + message
        );
        response = geminiResult.response.text();
        break;
        
      default: // OpenAI
        const completion = await openai.chat.completions.create({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message }
          ],
          max_tokens: 1000,
          temperature: 0.7
        });
        response = completion.choices[0].message.content;
    }
    
    // Salvar no cache
    responseCache.set(cacheKey, response);
    
    // Salvar no histórico
    await supabase.from('chat_history').insert({
      user_email: email,
      question: message,
      answer: response,
      model_used: model,
      credits_used: 1
    });
    
    // Descontar crédito
    await supabase
      .from('profiles')
      .update({ credits: user.credits - 1 })
      .eq('email', email);
    
    res.json({ 
      response,
      credits_remaining: user.credits - 1,
      model_used: model
    });
    
  } catch (error) {
    console.error('Erro no chat:', error);
    res.status(500).json({ error: 'Erro no processamento' });
  }
});

// ========== UPLOAD E ANÁLISE DE DOCUMENTOS ==========
app.post('/upload/document', upload.single('file'), async (req, res) => {
  try {
    const { email } = req.body;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: 'Arquivo não encontrado' });
    }
    
    let extractedText = '';
    
    // Processar PDF
    if (file.mimetype === 'application/pdf') {
      const pdfData = await pdfParse(file.buffer);
      extractedText = pdfData.text;
    }
    
    // Analisar com IA
    const analysis = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Analise este documento jurídico e identifique pontos relevantes para segunda fase penal OAB.'
        },
        {
          role: 'user',
          content: extractedText
        }
      ],
      max_tokens: 500
    });
    
    // Salvar no Supabase
    const { data } = await supabase
      .from('documents')
      .insert({
        user_email: email,
        filename: file.originalname,
        content: extractedText,
        analysis: analysis.choices[0].message.content,
        type: 'penal'
      })
      .select()
      .single();
    
    res.json({
      success: true,
      document_id: data.id,
      analysis: data.analysis
    });
    
  } catch (error) {
    console.error('Erro no upload:', error);
    res.status(500).json({ error: 'Erro ao processar documento' });
  }
});

// ========== CORREÇÃO DE PEÇA MANUSCRITA ==========
app.post('/upload/handwritten', upload.single('image'), async (req, res) => {
  try {
    const { email } = req.body;
    const image = req.file;
    
    // Usar Google Vision API
    const visionClient = new vision.ImageAnnotatorClient({
      keyFilename: process.env.GOOGLE_VISION_KEY
    });
    
    const [result] = await visionClient.textDetection({
      image: { content: image.buffer }
    });
    
    const detectedText = result.textAnnotations[0]?.description || '';
    
    // Analisar e corrigir com IA
    const correction = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'Corrija esta peça processual penal, identificando erros e sugerindo melhorias.'
        },
        {
          role: 'user',
          content: detectedText
        }
      ]
    });
    
    res.json({
      original_text: detectedText,
      corrections: correction.choices[0].message.content
    });
    
  } catch (error) {
    console.error('Erro na correção:', error);
    res.status(500).json({ error: 'Erro ao processar imagem' });
  }
});

// ========== SISTEMA DE PAGAMENTO ==========
app.post('/payment/create-checkout', async (req, res) => {
  try {
    const { email, plan } = req.body;
    
    const prices = {
      basic: 'price_1234567890', // R$ 29/mês
      pro: 'price_0987654321',   // R$ 59/mês
      premium: 'price_1111111111' // R$ 99/mês
    };
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'pix'],
      line_items: [{
        price: prices[plan],
        quantity: 1
      }],
      mode: 'subscription',
      success_url: 'https://oabot.com.br/success',
      cancel_url: 'https://oabot.com.br/cancel',
      customer_email: email,
      metadata: { email, plan }
    });
    
    res.json({ checkout_url: session.url });
    
  } catch (error) {
    console.error('Erro no pagamento:', error);
    res.status(500).json({ error: 'Erro ao criar checkout' });
  }
});

// Webhook do Stripe
app.post('/payment/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  try {
    const event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const { email, plan } = session.metadata;
      
      // Atualizar plano do usuário
      const credits = {
        basic: 100,
        pro: 300,
        premium: 1000
      };
      
      await supabase
        .from('profiles')
        .update({ 
          plan,
          credits: credits[plan],
          stripe_customer_id: session.customer
        })
        .eq('email', email);
    }
    
    res.json({ received: true });
    
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).send(`Webhook Error: ${error.message}`);
  }
});

// ========== SISTEMA DE CUPONS ==========
app.post('/coupon/apply', async (req, res) => {
  try {
    const { email, code } = req.body;
    
    // Verificar cupom
    const { data: coupon } = await supabase
      .from('coupons')
      .select('*')
      .eq('code', code)
      .single();
    
    if (!coupon || coupon.current_uses >= coupon.max_uses) {
      return res.status(400).json({ error: 'Cupom inválido ou expirado' });
    }
    
    // Aplicar benefícios
    const { data: user } = await supabase
      .from('profiles')
      .select('credits')
      .eq('email', email)
      .single();
    
    await supabase
      .from('profiles')
      .update({ 
        credits: (user?.credits || 0) + coupon.credits_bonus,
        plan: 'beta'
      })
      .eq('email', email);
    
    // Atualizar uso do cupom
    await supabase
      .from('coupons')
      .update({ current_uses: coupon.current_uses + 1 })
      .eq('code', code);
    
    res.json({ 
      success: true,
      credits_added: coupon.credits_bonus
    });
    
  } catch (error) {
    console.error('Erro no cupom:', error);
    res.status(500).json({ error: 'Erro ao aplicar cupom' });
  }
});

// ========== ROTAS ADMIN ==========
app.get('/admin/dashboard', async (req, res) => {
  try {
    const { data: stats } = await supabase.rpc('get_admin_stats');
    
    res.json({
      users: stats.total_users,
      revenue: stats.total_revenue,
      chats_today: stats.chats_today,
      active_subscriptions: stats.active_subscriptions,
      top_questions: stats.top_questions
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar estatísticas' });
  }
});

// ========== BLOG API ==========
app.get('/blog/posts', async (req, res) => {
  const { data: posts } = await supabase
    .from('blog_posts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);
  
  res.json(posts || []);
});

app.post('/blog/create', async (req, res) => {
  const { title, content, author } = req.body;
  
  const { data } = await supabase
    .from('blog_posts')
    .insert({ title, content, author, slug: title.toLowerCase().replace(/ /g, '-') })
    .select()
    .single();
  
  res.json(data);
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`OABOT API v3.0 rodando na porta ${PORT}`);
  console.log('Features: Multi-AI, Pagamentos, Upload, Blog');
});