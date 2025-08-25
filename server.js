const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Dados em memória
let users = {};
let chats = [];

// Rotas
app.get('/', (req, res) => {
  res.json({ 
    status: 'online',
    service: 'OABOT API',
    version: '3.0'
  });
});

app.post('/chat', async (req, res) => {
  const { message, email } = req.body;
  
  if (!users[email]) {
    users[email] = { credits: 5 };
  }
  
  if (users[email].credits <= 0) {
    return res.status(403).json({ error: 'Sem créditos' });
  }
  
  const response = `OABOT: Sua pergunta sobre '${message}' foi processada. Em produção, aqui virá a resposta da IA.`;
  
  chats.push({ email, message, response, date: new Date() });
  users[email].credits--;
  
  res.json({ 
    response,
    credits_remaining: users[email].credits
  });
});

app.post('/api/register', (req, res) => {
  const { email } = req.body;
  users[email] = { email, credits: 5, plan: 'free' };
  res.json({ success: true, user: users[email] });
});

app.get('/api/credits/:email', (req, res) => {
  const user = users[req.params.email] || { credits: 0 };
  res.json({ credits: user.credits, plan: user.plan || 'free' });
});

app.get('/api/admin/stats', (req, res) => {
  res.json({
    total_users: Object.keys(users).length,
    total_chats: chats.length,
    users: Object.values(users)
  });
});

app.listen(PORT, () => {
  console.log('OABOT rodando na porta ' + PORT);
});