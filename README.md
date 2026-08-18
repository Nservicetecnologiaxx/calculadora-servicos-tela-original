# Calculadora de Serviços — Zakka Cell

Aplicativo PWA para **Troca de Tela Original** e **Troca de Vidro**, com consulta automática de telas originais na Zakka Cell.

## Regras implementadas

### Troca de Tela Original
`base = custo da peça + 120% do custo + R$ 60 + 3% do custo`

### Troca de Vidro
`base = custo da tela original + 10% do custo + R$ 60 + 3% do custo`

### Pagamentos
- Cartão: valor-base arredondado **para cima** até a próxima dezena; mostra total e 10x.
- PIX/Dinheiro: 10% de desconto sobre o valor-base e depois arredondamento **para cima** até a próxima dezena.
- O custo da peça e informações de lucro **não são enviados nem exibidos na interface**.

## Filtro do fornecedor
Aceita somente telas/frontais/display identificados como **ORIGINAL** ou **FRONTAL NACIONAL**. Ignora INCELL, OLED, PREMIUM, AAA, PARALELA, COMPATÍVEL e SIMILAR. Quando a API informa falta de estoque, o item é ignorado.

Se não houver tela original elegível: **Consultar o Técnico**.

## Executar
Requer apenas Node.js 18 ou superior; não há dependências externas.

```bash
node server.js
```

Abra `http://localhost:3000`.

## Publicação
Pode ser publicado em qualquer hospedagem Node com HTTPS (Render, Railway, Fly.io etc.). Em HTTPS, o PWA pode ser adicionado à tela inicial no iPhone/Android.

## Integração
A consulta tenta primeiro a API pública WooCommerce Store da Zakka Cell e usa busca HTML como fallback. Como a fonte é de terceiro, futuras alterações no site/API podem exigir adaptação do conector.
