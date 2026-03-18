// netlify/functions/analisar-planilha.js

export default async (request, context) => {
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response('', {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ erro: 'Método não permitido' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  try {
    const body = await request.json();
    const { dados, nomeArquivo } = body;

    if (!dados || dados.trim().length === 0) {
      return new Response(JSON.stringify({ erro: 'Nenhum dado recebido.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const ANTHROPIC_KEY = Netlify.env.get('ANTHROPIC_API_KEY');

    if (!ANTHROPIC_KEY) {
      return new Response(JSON.stringify({ erro: 'Chave de API não configurada.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const dadosLimitados = dados.slice(0, 20000);

    const prompt = `Analise esta planilha financeira brasileira e retorne APENAS um JSON válido, sem markdown, sem texto adicional.

ARQUIVO: ${nomeArquivo || 'planilha'}

DADOS:
${dadosLimitados}

FORMATO OBRIGATÓRIO (JSON puro, sem nada antes ou depois):
{"empresa":"nome","periodo":"período","meses":[{"label":"Jan/25","key":"2025-01","e":1000.00,"s":800.00,"l":200.00,"entradas":[{"desc":"descrição","val":500.00,"date":"05/01/2025","status":"rcv","categoria":"Vendas"}],"saidas":[{"desc":"descrição","val":400.00,"date":"10/01/2025","status":"rcv","categoria":"Aluguel"}]}],"resumo":{"total_entradas":0,"total_saidas":0,"lucro_total":0},"insights":["insight 1","insight 2"]}

REGRAS:
- Valores negativos ou com "-" são saídas
- Valores positivos são entradas  
- Agrupe por mês/ano
- Retorne JSON puro sem markdown`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Erro na API (${response.status}): ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || '';

    let parsed;
    try {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content.trim();
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      throw new Error('A IA retornou formato inválido. Tente novamente.');
    }

    if (!parsed.meses || !Array.isArray(parsed.meses) || parsed.meses.length === 0) {
      throw new Error('Nenhum dado financeiro identificado na planilha.');
    }

    return new Response(JSON.stringify({ sucesso: true, dados: parsed }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    return new Response(JSON.stringify({ erro: error.message || 'Erro interno.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
};

export const config = {
  path: '/api/analisar-planilha',
};
