# Trucker Cap Você na Guitarra

App web para estudar riffs e solos de ouvido e tocar com o acompanhamento da música.

- **Música inteira** toca o áudio original no trecho preparado. Para liberar o modo em faixas salvas anteriormente, prepare o original novamente.
- **Só Guitarra** toca a faixa estimada de guitarra.
- **Sem Guitarra** toca o acompanhamento com a voz. A voz permanece na base.
- **Sem Guitarra e Voz** deixa a base para cantar e tocar. Faixas salvas em versões anteriores precisam ser preparadas novamente para liberar esse modo.
- **Velocidade** vai de 50% a 100% nos quatro modos. A reprodução preserva a afinação original.
- **Meu Repertório** guarda a guitarra isolada e a base no navegador. Abra uma música salva para praticar sem separar de novo. Ao terminar uma base salva, o player abre a próxima da lista.
- **Baixar áudio** exporta a versão selecionada em MP3 ou WAV no andamento original.

## Executar

Extraia o ZIP. Com Node.js 24, rode `npm test` na pasta do projeto. Sirva a pasta `dist` por HTTP local ou por HTTPS em hospedagem estática. Para rodar localmente com Python 3:

```sh
python3 -m http.server 8080 --directory dist
```

Abra http://localhost:8080. O arquivo `vercel.json` já aponta a publicação para `dist`.

## Modelo de separação

Clique em **Preparar música** para baixar o modelo de cerca de 136 MB. Se o download automático falhar, baixe o [arquivo ONNX](https://huggingface.co/alekshandru/htdemucs-6s-onnx/blob/main/htdemucs_6s_fp16weights.onnx) e selecione **Usar modelo local** em **Opções avançadas**. O arquivo é verificado por SHA-256 e pode ser armazenado no navegador. A versão anterior de quatro fontes não é compatível.

A separação roda no aparelho. O modelo estima guitarra e voz separadamente, e o app reúne as demais fontes em um acompanhamento. A qualidade depende da gravação. Comece por um trecho curto em aparelhos com pouca memória.

Para testar o modelo real pelo Node.js, use `TC_STEMS_MODEL=/caminho/htdemucs_6s_fp16weights.onnx node tests/inference.optional.mjs`.

## Instalar e consultar o manual

Publique a pasta `dist` por HTTPS. Na barra superior, **Instalar app** abre a instalação quando o navegador disponibiliza essa opção. Nos demais casos, o botão mostra os passos para Android, iPhone/iPad, Windows e Mac. **Manual de instalação** abre o guia completo para todos os sistemas.

Use Chrome no Android, Safari no iPhone/iPad, Chrome ou Edge no Windows e Safari ou Chrome no Mac. Para adicionar ao Dock pelo Safari, use macOS Sonoma 14 ou posterior. As instruções de instalação e a configuração do app foram preparadas para essas plataformas. A separação com música real ainda precisa ser validada em cada uma.

## Preservação do acompanhamento

As bases são feitas a partir do áudio original, retirando a guitarra estimada e, no modo Sem Guitarra e Voz, também o vocal estimado. Assim, instrumentos que a IA não classifica separadamente permanecem no acompanhamento, salvo quando forem confundidos com a guitarra ou a voz. Para atualizar uma base antiga, processe novamente o arquivo original e salve o resultado no repertório.

## Testar o RoFormer no próprio computador

1. Instale Python e FFmpeg. Em um ambiente Python compatível, instale `audio-separator[cpu]` com pip. Para GPU, use a instalação compatível indicada pelo [projeto audio-separator](https://github.com/nomadkaraoke/python-audio-separator).
2. Baixe os arquivos do [BS-RoFormer SW](https://huggingface.co/FractalSurfer/BS-RoFormer-SW-6stem/tree/main). Coloque-os em `modelos` com os nomes `BS-Roformer-SW.ckpt` e `BS-Roformer-SW.yaml`. Os pesos têm licença declarada como desconhecida.
3. Execute `python servidor.py` no ambiente que tem o comando `audio-separator`. Abra http://127.0.0.1:8080 e use **Testar Roformer**. Para medir a qualidade, comece por um trecho curto com guitarra e piano juntos.

Este piloto atende somente no computador que roda o servidor. Na Vercel, o app estático pode usar o separador original. Para oferecer RoFormer a celulares e a clientes, o serviço Python precisa ser hospedado com HTTPS, acesso autenticado e capacidade adequada. A separação local com pesos reais ainda precisa ser validada.


## Testar no GitHub Codespaces

1. Extraia o ZIP e envie os arquivos para a raiz do repositório, incluindo a pasta oculta `.devcontainer` e o arquivo `.gitignore`.
2. Abra **Code → Codespaces → Create codespace**. A configuração instala FFmpeg e o separador para CPU na primeira criação.
3. No Codespace, coloque os dois arquivos do modelo na pasta `modelos`, conforme os nomes indicados acima. Mantenha-os fora do commit.
4. Execute `python servidor.py` no terminal. Na aba **Ports**, abra a porta **8080**, com visibilidade **Private**.
5. No app, selecione o trecho de teste e clique em **Testar Roformer**. O botão aparece quando o comando do separador e os dois arquivos do modelo estão disponíveis.

O Codespace é um ambiente de teste em CPU. O tempo de separação e a inferência com os pesos reais ainda precisam ser medidos.
