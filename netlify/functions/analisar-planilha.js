// netlify/functions/analisar-planilha.js
// Backend protegido — chave da API invisível ao cliente

exports.handler = async (event) => {
  console.log('Função iniciada:', event.httpMethod);

  // CORS preflight
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
    return {
      statusCode: 405,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ erro: 'Método não permitido' }),
    };
  }

  try {
    // Parse body
    let body;
    try {
      body = JSON.parse(event.body);
    } catch(e) {
      console.error('Erro ao parsear body:', e.message);
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ erro: 'Corpo da requisição inválido' }),
      };
    }

    const { dados, nomeArquivo } = body;
    console.log('Arquivo recebido:', nomeArquivo, '| Tamanho:', dados?.length || 0, 'chars');

    if (!dados || dados.trim().length === 0) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ erro: 'Nenhum dado recebido da planilha.' }),
      };
    }

    // Verificar chave
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
    console.log('Chave configurada:', ANTHROPIC_KEY ? 'SIM' : 'NÃO');

    if (!ANTHROPIC_KEY) {
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ erro: 'Chave de API não configurada no servidor.' }),
      };
    }

    // Limitar dados para evitar timeout (max 30k chars)
    const dadosLimitados = dados.slice(0, 30000);
    console.log('Enviando para Claude:', dadosLimitados.length, 'chars');

    const prompt = `Você é um especialista em finanças empresariais brasileiras.
Analise os dados desta planilha financeira e retorne um JSON estruturado.

NOME DO ARQUIVO: ${nomeArquivo || 'planilha'}

DADOS:
${dadosLimitados}

INSTRUÇÕES:
1. Identifique TODAS as entradas (receitas) e saídas (despesas)
2. Categorize cada transação (Aluguel, Salários, Vendas, Marketing, etc.)
3. Identifique o mês/ano de cada lançamento
4. Agrupe por mês

Retorne APENAS um JSON válido neste formato exato (sem texto adicional, sem markdown):
{
  "empresa": "nome da empresa identificado",
  "periodo": "período identificado",
  "meses": [
    {
      "label": "Jan/25",
      "key": "2025-01",
      "e": 15000.00,
      "s": 9500.00,
      "l": 5500.00,
      "entradas": [
        {"desc": "descrição", "val": 5000.00, "date": "05/01/2025", "status": "rcv", "categoria": "Vendas"}
      ],
      "saidas": [
        {"desc": "descrição", "val": 2000.00, "date": "10/01/2025", "status": "rcv", "categoria": "Aluguel"}
      ]
    }
  ],
  "resumo": {
    "total_entradas": 0,
    "total_saidas": 0,
    "lucro_total": 0
  },
  "insights": ["insight 1", "insight 2", "insight 3"]
}`;

    console.log('Chamando API Claude...');

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

    console.log('Status da API:', response.status);

    if (!response.ok) {
      const errText = await response.text();
      console.error('Erro da API:', errText);
      throw new Error(`Erro na API Claude (${response.status}): ${errText.slice(0,200)}`);
    }

    const data = await response.json();
    console.log('Resposta recebida, tipo:', data.content?.[0]?.type);

    const content = data.content?.[0]?.text || '';
    console.log('Conteúdo (primeiros 200 chars):', content.slice(0, 200));

    // Extrair JSON da resposta
    let parsed;
    try {
      // Tentar extrair de bloco markdown se necessário
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content.trim();
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      console.error('Erro ao parsear JSON da IA:', e.message);
      console.error('Conteúdo recebido:', content.slice(0, 500));
      throw new Error('A IA retornou formato inválido. Verifique se a planilha contém dados financeiros.');
    }

    if (!parsed.meses || !Array.isArray(parsed.meses) || parsed.meses.length === 0) {
      throw new Error('Nenhum dado financeiro identificado na planilha. Verifique se ela contém entradas e saídas.');
    }

    console.log('Sucesso! Meses identificados:', parsed.meses.length);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ sucesso: true, dados: parsed }),
    };

  } catch (error) {
    console.error('Erro geral:', error.message);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ erro: error.message || 'Erro interno. Tente novamente.' }),
    };
  }
};
