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

    // Monta listas separadas de entradas e saídas a partir da estrutura paralela
    const entradas = [];
    const saidas = [];

    for (const row of dados) {
      // Colunas E=4, F=5, G=6 → entradas (índices 4,5,6)
      const descEntrada = row[4];
      const valorEntrada = row[5];
      const dataEntrada = row[6];
      if (descEntrada && valorEntrada && typeof valorEntrada === "number") {
        entradas.push({ descricao: descEntrada, valor: valorEntrada, data: dataEntrada || "" });
      }

      // Colunas I=8, J=9, K=10 → saídas (índices 8,9,10)
      const descSaida = row[8];
      const valorSaida = row[9];
      const dataSaida = row[10];
      if (descSaida && valorSaida && typeof valorSaida === "number") {
        saidas.push({ descricao: descSaida, valor: valorSaida, data: dataSaida || "" });
      }
    }

    // Pega totais do resumo (linha 1 e 2 da planilha)
    const totalEntradas = dados[0] ? (dados[0][2] || 0) : 0;
    const totalSaidas = dados[1] ? (dados[1][2] || 0) : 0;

    const resumoStr = JSON.stringify({
      totalEntradas,
      totalSaidas,
      entradas: entradas.slice(0, 15),
      saidas: saidas.slice(0, 15),
    });

    const client = new Anthropic.Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const prompt = `Você é um analisador financeiro. Analise estes dados financeiros e retorne APENAS um objeto JSON válido, sem texto antes ou depois, sem markdown.

Arquivo: "${nomeArquivo}"
Dados:
${resumoStr}

Retorne EXATAMENTE este JSON preenchido com os dados reais:
{"empresa":"ABRii","periodo":"Jun/2024 a Mar/2026","resumo":"Resumo em 2 frases do desempenho financeiro","totalReceitas":0,"totalDespesas":0,"lucroLiquido":0,"margemLucro":0,"transacoes":[{"data":"DD/MM/AAAA","descricao":"descrição","categoria":"categoria","valor":0,"tipo":"receita ou despesa"}],"categorias":[{"nome":"categoria","total":0,"percentual":0}],"insights":["insight 1","insight 2","insight 3"]}

REGRAS:
- Retorne APENAS o JSON, nada mais
- Máximo 15 transações, 6 categorias, 3 insights
- Valores numéricos puros, sem R$
- JSON completo e válido`;

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const textoResposta = response.content[0].text.trim();
    const jsonMatch = textoResposta.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ erro: "IA não retornou JSON válido", debug: textoResposta.substring(0, 200) }),
      };
    }

    const jsonParsed = JSON.parse(jsonMatch[0]);
    return { statusCode: 200, headers, body: JSON.stringify(jsonParsed) };

  } catch (err) {
    console.error("Erro:", err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ erro: "Erro interno", detalhe: err.message }),
    };
  }
};
