# Trucker Cap Você na Guitarra

App web para estudar riffs e solos de ouvido e tocar com o acompanhamento da música.

- **Só Guitarra** toca a faixa estimada de guitarra.
- **Sem Guitarra** toca o acompanhamento com a voz. Use **Silenciar voz** se quiser cantar enquanto toca.
- **Velocidade** vai de 50% a 100% nos dois modos. A redução atual também baixa a afinação.
- **Baixar áudio** exporta a versão selecionada em MP3 ou WAV no andamento original.
- **Opções de click** abre os ajustes de metrônomo e exportação.

## Executar

Extraia o ZIP. Com Node.js 24, rode `npm test` na pasta do projeto. Sirva a pasta `dist` por HTTP local ou por HTTPS em hospedagem estática. Para rodar localmente com Python 3:

```sh
python3 -m http.server 8080 --directory dist
```

Abra http://localhost:8080. O arquivo `vercel.json` já aponta a publicação para `dist`.

## Modelo de separação

Clique em **Preparar IA** para baixar o modelo de cerca de 136 MB. Se o download automático falhar, baixe o [arquivo ONNX](https://huggingface.co/alekshandru/htdemucs-6s-onnx/blob/main/htdemucs_6s_fp16weights.onnx) e selecione **Usar modelo local**. O arquivo é verificado por SHA-256 e pode ser armazenado no navegador. A versão anterior de quatro fontes não é compatível.

A separação roda no aparelho. O modelo estima guitarra e voz separadamente, e o app reúne as demais fontes em um acompanhamento. A qualidade depende da gravação. Comece por um trecho curto em aparelhos com pouca memória.

Para testar o modelo real pelo Node.js, use `TC_STEMS_MODEL=/caminho/htdemucs_6s_fp16weights.onnx node tests/inference.optional.mjs`.
