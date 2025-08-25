const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Dados temporários em memória
let users = {};
let chats = [];

app.get('/', (req, res) => {
  res.json({ 
    status: 'online',
    service: 'OABOT API v2.0',
    timestamp: new Date(),
    endpoints: ['/chat', '/api/register', '/api/credits/:email', '/api/admin/stats']
  });
});

app.post('/chat', async (req, res) => {
  try {
    const { message, email } = req.body;
    
    if (!email || !message) {
      return res.status(400).json({ error: 'Email e mensagem obrigatórios' });
    }
    
    // Verificar usuário
    if (!users[email]) {
      users[email] = { credits: 5, plan: 'free' };
    }
    
    if (users[email].credits <= 0) {
      return res.status(403).json({ error: 'Sem créditos disponíveis' });
    }
    
    // Resposta simulada (em produção, chamar OpenAI aqui)
    const response = `[OABOT] Analisando sua pergunta sobre: "${message}". 
    
Para segunda fase penal do Exame de Ordem, lembre-se:
- Habeas Corpus: remédio constitucional (art. 5º, LXVIII, CF)
- Apelação: recurso contra sentença (art. 593, CPP)
- RESE: Recurso em Sentido Estrito (art. 581, CPP)
- Resposta à Acusação: defesa preliminar (art. 396-A, CPP)`;
    
    // Salvar chat
    chats.push({
      email,
      question: message,
      answer: response,
      timestamp: new Date()
    });
    
    // Descontar crédito
    users[email].credits--;
    
    res.json({ 
      response,
      credits_remaining: users[email].credits
    });
    
  } catch (error) {
    console.error('Erro:', error);
    res.status(500).json({ error: 'Erro no processamento' });
  }
});

app.post('/api/register', async (req, res) => {
  const { email, name, coupon } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: 'Email obrigatório' });
  }
  
  // Verificar cupom beta
  let credits = 5;
  let plan = 'free';
  
  if (coupon && coupon.startsWith('OABOT-BETA-')) {
    credits = 50;
    plan = 'beta';
  }
  
  users[email] = {
    email,
    name: name || email.split('@')[0],
    credits,
    plan,
    created_at: new Date()
  };
  
  res.json({ 
    success: true,
    user: users[email]
  });
});

app.get('/api/credits/:email', async (req, res) => {
  const { email } = req.params;
  const user = users[email] || { credits: 0, plan: 'free' };
  
  res.json({ 
    email,
    credits: user.credits,
    plan: user.plan
  });
});

app.get('/api/admin/stats', async (req, res) => {
  const totalUsers = Object.keys(users).length;
  const totalChats = chats.length;
  const recentUsers = Object.values(users).slice(-10);
  
  res.json({
    total_users: totalUsers,
    total_chats: totalChats,
    active_today: Object.values(users).filter(u => {
      const created = new Date(u.created_at || Date.now());
      return created.toDateString() === new Date().toDateString();
    }).length,
    recent_users: recentUsers,
    recent_chats: chats.slice(-5)
  });
});

app.listen(PORT, () => {
  console.log(`OABOT API rodando na porta ${PORT}`);
  console.log(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
});