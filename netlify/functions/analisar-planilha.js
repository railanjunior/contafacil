const Anthropic = require("@anthropic-ai/sdk");

exports.handler = async function (event, context) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  try {
    const body = JSON.parse(event.body);
    const { dados, nomeArquivo } = body;

    if (!dados || dados.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ erro: "Nenhum dado recebido" }),
      };
    }

    // Limita dados para não explodir o contexto
    const dadosLimitados = dados.slice(0, 15);
    const dadosStr = JSON.stringify(dadosLimitados);
    const dadosTruncados = dadosStr.length > 12000
      ? dadosStr.substring(0, 12000) + "..."
      : dadosStr;

    const client = new Anthropic.Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const prompt = `Você é um analisador financeiro. Analise estes dados de planilha e retorne APENAS um objeto JSON válido, sem texto antes ou depois, sem markdown, sem blocos de código.

Dados do arquivo "${nomeArquivo}":
${dadosTruncados}

Retorne EXATAMENTE este JSON (substitua os valores pelos dados reais, mantenha a estrutura):
{"empresa":"Nome da empresa ou clínica identificada","periodo":"Período dos dados ex: Jan-Mar 2026","resumo":"Resumo executivo em 2 frases","totalReceitas":0,"totalDespesas":0,"lucroLiquido":0,"margemLucro":0,"transacoes":[{"data":"DD/MM/AAAA","descricao":"descrição","categoria":"Receita ou categoria de despesa","valor":0,"tipo":"receita ou despesa"}],"categorias":[{"nome":"categoria","total":0,"percentual":0}],"insights":["insight 1","insight 2","insight 3"]}

REGRAS CRÍTICAS:
- Retorne APENAS o JSON, nada mais
- Máximo 15 transações no array transacoes
- Máximo 6 categorias no array categorias  
- Máximo 3 insights
- Todos os valores numéricos sem R$ ou formatação, apenas número
- JSON deve estar completo e válido`;

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000, // JSON pequeno e controlado = não precisa de mais
      messages: [{ role: "user", content: prompt }],
    });

    const textoResposta = response.content[0].text.trim();

    // Extrai o JSON mesmo se vier com lixo antes/depois
    const jsonMatch = textoResposta.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("Resposta sem JSON:", textoResposta);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          erro: "IA não retornou JSON válido",
          debug: textoResposta.substring(0, 200),
        }),
      };
    }

    // Testa se o JSON é válido antes de retornar
    const jsonParsed = JSON.parse(jsonMatch[0]);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(jsonParsed),
    };
  } catch (err) {
    console.error("Erro na função:", err.message);

    // Distingue erro de JSON do erro geral
    if (err instanceof SyntaxError) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          erro: "JSON inválido retornado pela IA",
          detalhe: err.message,
        }),
      };
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        erro: "Erro interno",
        detalhe: err.message,
      }),
    };
  }
};
