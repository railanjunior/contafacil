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

    const prompt = `Analise este arquivo financeiro e retorne APENAS JSON, sem texto, sem markdown.

Arquivo: "${nomeArquivo}"
Dados:
${dados.substring(0, 10000)}

Retorne este JSON exato (preencha com dados reais, máximo 6 meses, máximo 3 transações por mês):
{"sucesso":true,"dados":{"empresa":"ABRii","periodo":"Jun/2024 a Mar/2026","meses":[{"label":"Jun/24","key":"2024-06","e":26706,"s":25087,"l":1619,"entradas":[{"desc":"Entrada exemplo","val":26706,"date":"01/06/2024","status":"rcv","categoria":"Receita"}],"saidas":[{"desc":"Saída exemplo","val":25087,"date":"01/06/2024","status":"rcv","categoria":"Despesa"}]}],"insights":["insight 1","insight 2"]}}

REGRAS: apenas JSON válido, l = e menos s, valores sem R$`;

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });

    const texto = response.content[0].text.trim();
    console.log("Resposta IA (primeiros 500):", texto.substring(0, 500));

    const jsonMatch = texto.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { statusCode: 500, headers, body: JSON.stringify({ erro: "IA não retornou JSON", debug: texto.substring(0, 300) }) };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return { statusCode: 200, headers, body: JSON.stringify(parsed) };

  } catch (err) {
    console.error("Erro:", err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ erro: "Erro interno", detalhe: err.message }) };
  }
};
