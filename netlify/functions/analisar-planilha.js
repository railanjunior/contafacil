// netlify/functions/analisar-planilha.js
// Backend protegido — a chave da API fica aqui, invisível para o cliente

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { dados, nomeArquivo } = JSON.parse(event.body);

    if (!dados || dados.trim().length === 0) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ erro: 'Nenhum dado recebido da planilha.' }),
      };
    }

    // Chave protegida no servidor — nunca exposta ao cliente
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

    if (!ANTHROPIC_KEY) {
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ erro: 'Chave de API não configurada no servidor.' }),
      };
    }

    const prompt = `Você é um especialista em finanças empresariais brasileiras. 
Recebi os dados de uma planilha financeira de uma empresa chamada "${nomeArquivo}".

DADOS DA PLANILHA:
${dados}

Sua tarefa é analisar esses dados e retornar um JSON estruturado com as movimentações financeiras organizadas por mês.

REGRAS IMPORTANTES:
1. Identifique TODAS as entradas (receitas, vendas, recebimentos) e saídas (despesas, pagamentos, custos)
2. Categorize cada transação (ex: Aluguel, Salários, Vendas, Serviços, Marketing, Impostos, etc.)
3. Identifique o mês e ano de cada lançamento
4. Se uma data não for clara, use o contexto para inferir
5. Valores negativos ou com sinal "-" são saídas
6. Valores positivos são entradas
7. Agrupe por mês no formato YYYY-MM

Retorne APENAS um JSON válido, sem texto adicional, neste formato exato:
{
  "empresa": "Nome inferido da empresa",
  "periodo": "período identificado (ex: Jan/2025 a Dez/2025)",
  "meses": [
    {
      "label": "Jan/25",
      "key": "2025-01",
      "e": 15000.00,
      "s": 9500.00,
      "l": 5500.00,
      "entradas": [
        {"desc": "Descrição da receita", "val": 5000.00, "date": "05/01/2025", "status": "rcv", "categoria": "Vendas"}
      ],
      "saidas": [
        {"desc": "Descrição da despesa", "val": 2000.00, "date": "10/01/2025", "status": "rcv", "categoria": "Aluguel"}
      ]
    }
  ],
  "resumo": {
    "total_entradas": 0,
    "total_saidas": 0,
    "lucro_total": 0,
    "margem_media": 0,
    "melhor_mes": "Mês com maior lucro",
    "categorias_saidas": {"Aluguel": 0, "Salários": 0}
  },
  "insights": [
    "Insight 1 sobre o negócio",
    "Insight 2 sobre crescimento ou atenção",
    "Insight 3 sobre oportunidade"
  ]
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 8000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API Claude retornou erro ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || '';

    // Validate JSON before returning
    let parsed;
    try {
      // Extract JSON if wrapped in markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, content];
      parsed = JSON.parse(jsonMatch[1] || content);
    } catch (e) {
      throw new Error('IA retornou formato inválido. Tente novamente.');
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ sucesso: true, dados: parsed }),
    };

  } catch (error) {
    console.error('Erro na função:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ erro: error.message || 'Erro interno. Tente novamente.' }),
    };
  }
};
