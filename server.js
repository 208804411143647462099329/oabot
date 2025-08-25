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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`OABOT API rodando na porta ${PORT}`);
});