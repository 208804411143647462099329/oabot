const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const { createClient } = require('@supabase/supabase-js');
const { OpenAI } = require('openai');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Rota principal
app.get('/', (req, res) => {
    res.json({ 
        status: 'online', 
        service: 'OABOT API',
        version: '1.0' 
    });
});

// Chat endpoint
app.post('/chat', async (req, res) => {
    const { message } = req.body;
    
    try {
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: 'Você é o OABOT, assistente especializado em preparação para o Exame da OAB. Responda de forma clara e objetiva em português brasileiro.'
                },
                { role: 'user', content: message }
            ],
            max_tokens: 500
        });
        
        res.json({ 
            response: completion.choices[0].message.content 
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao processar' });
    }
});




app.listen(PORT, () => {
    console.log(`OABOT API rodando na porta ${PORT}`);
});

// Rota para cadastro simples
app.post('/api/register', async (req, res) => {
  const { email } = req.body;
  const { data, error } = await supabase
    .from('profiles')
    .insert({ email, credits: 5 })
    .select();
  if (error) {
    return res.status(400).json({ error: 'Email j\u00e1 cadastrado' });
  }
  res.json({ success: true, user: data[0] });
});

// Rota para verificar cr\u00e9ditos
app.get('/api/credits/:email', async (req, res) => {
  const { email } = req.params;
  const { data } = await supabase
    .from('profiles')
    .select('credits')
    .eq('email', email)
    .single();
  res.json({ credits: data?.credits || 0 });
});

// Rota b\u00e1sica do admin
app.get('/api/admin/stats', async (req, res) => {
  const { data: users } = await supabase.from('profiles').select('*');
  const { data: chats } = await supabase
    .from('chat_history')
    .select('*')
    .gte('created_at', new Date().toISOString().split('T')[0]);
  res.json({
    totalUsers: users?.length || 0,
    questionsToday: chats?.length || 0,
    users: users || []
  });
});

// Porta de execucao
const PORT = process.env.PORT || 3000;
