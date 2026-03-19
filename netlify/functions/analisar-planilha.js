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

    if (!dados) {
      return { statusCode: 400, headers, body: JSON.stringify({ erro: "Nenhum dado recebido" }) };
    }

    const dadosTrunc = dados.substring(0, 15000);

    const client = new Anthropic.Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const prompt = `Você é um analisador financeiro. Analise este CSV/texto financeiro e retorne APENAS JSON válido, sem texto antes ou depois, sem markdown.

Arquivo: "${nomeArquivo}"
Conteúdo:
${dadosTrunc}

Retorne EXATAMENTE este JSON com os dados reais encontrados:
{"sucesso":true,"dados":{"empresa":"nome da empresa identificada","periodo":"período dos dados","meses":[{"label":"Mês/Ano","key":"AAAA-MM","e":0,"s":0,"l":0,"entradas":[{"desc":"descrição","val":0,"date":"DD/MM/AAAA","status":"rcv","categoria":"categoria"}],"saidas":[{"desc":"descrição","val":0,"date":"DD/MM/AAAA","status":"rcv","categoria":"categoria"}]}],"insights":["insight 1","insight 2","insight 3"]}}

REGRAS CRÍTICAS:
- Retorne APENAS o JSON, nada mais
- "l" = e - s (lucro = entradas - saídas)
- Máximo 5 entradas e 5 saídas por mês
- Máximo 12 meses
- Máximo 3 insights
- Valores numéricos puros sem R$
- JSON completo e válido`;

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 3000,
      messages: [{ role: "user", content: prompt }],
    });

    const texto = response.content[0].text.trim();
    const jsonMatch = texto.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      console.error("Sem JSON na resposta:", texto.substring(0, 300));
      return { statusCode: 500, headers, body: JSON.stringify({ erro: "IA não retornou JSON válido", debug: texto.substring(0, 200) }) };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return { statusCode: 200, headers, body: JSON.stringify(parsed) };

  } catch (err) {
    console.error("Erro:", err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ erro: "Erro interno", detalhe: err.message }) };
  }
};
