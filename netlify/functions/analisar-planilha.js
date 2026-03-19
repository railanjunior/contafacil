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

    const client = new Anthropic.Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const prompt = `Analise este arquivo financeiro. Retorne APENAS JSON puro, sem markdown, sem texto.

Arquivo: "${nomeArquivo}"
Dados:
${dados.substring(0, 8000)}

Retorne EXATAMENTE este formato JSON com no máximo 3 meses e 2 transações por mês:
{"sucesso":true,"dados":{"empresa":"ABRii","periodo":"Jun/2024 a Mar/2025","meses":[{"label":"Jun/24","key":"2024-06","e":26706,"s":25087,"l":1619,"entradas":[{"desc":"MS AUTO CAR","val":2000,"date":"29/06/2024","status":"rcv","categoria":"Venda"}],"saidas":[{"desc":"Aluguel","val":2500,"date":"01/06/2024","status":"rcv","categoria":"Fixo"}]}],"insights":["insight 1"]}}

IMPORTANTE: JSON deve terminar com }} no final. Valores sem R$.`;

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    });

    const texto = response.content[0].text.trim();
    console.log("Resposta IA:", texto.substring(0, 800));

    const textoLimpo = texto.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const jsonMatch = textoLimpo.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { statusCode: 500, headers, body: JSON.stringify({ erro: "IA não retornou JSON", debug: textoLimpo.substring(0, 300) }) };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return { statusCode: 200, headers, body: JSON.stringify(parsed) };

  } catch (err) {
    console.error("Erro:", err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ erro: "Erro interno", detalhe: err.message }) };
  }
};
