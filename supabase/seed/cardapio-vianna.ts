/**
 * Cardápio real da Vianna Pizzaria, transcrito das artes enviadas em
 * 2026-10-01 (erros de digitação óbvios corrigidos). Importado por
 * apps/bot/scripts/importar-cardapio.ts.
 *
 * Preço de cada sabor por tamanho = preço base do tamanho + adicional.
 */

export const TAMANHOS = [
  { nome: "Média", fatias: 6, maxSabores: 2, precoBase: 55 },
  { nome: "Grande", fatias: 8, maxSabores: 2, precoBase: 60 },
  { nome: "Big", fatias: 12, maxSabores: 3, precoBase: 80 },
  { nome: "Gigante", fatias: 16, maxSabores: 4, precoBase: 90 },
  { nome: "Família", fatias: 20, maxSabores: 4, precoBase: 100 },
];

export const BORDAS = [
  { nome: "Borda Catupiry", preco: 15 },
  { nome: "Borda Cheddar", preco: 15 },
  { nome: "Borda Chocolate", preco: 15 },
  { nome: "Borda Cream Cheese", preco: 22 },
];

type Sabor = { nome: string; descricao: string | null; adicional?: number; foto?: string };

export const CATEGORIAS: Array<{ nome: string; adicional: number; sabores: Sabor[] }> = [
  {
    nome: "Salgadas",
    adicional: 0,
    sabores: [
      { nome: "4 Queijos", descricao: "Mussarela, provolone, parmesão, catupiry e orégano" },
      { nome: "Alho e Óleo", descricao: "Mussarela, alho e óleo e orégano" },
      { nome: "Americana", descricao: "Mussarela, bacon, milho, ovo e orégano" },
      { nome: "Atum", descricao: "Mussarela, atum e orégano" },
      { nome: "A Moda da Casa", descricao: "Mussarela, frango, bacon, milho, ervilha, palmito e orégano" },
      { nome: "Bacon", descricao: "Mussarela, bacon e orégano" },
      { nome: "Baiana", descricao: "Mussarela, calabresa, pimenta calabresa e orégano" },
      { nome: "Bolonhesa", descricao: "Mussarela, bolonhesa, cebola e orégano" },
      { nome: "Brasileira", descricao: "Mussarela, milho, ervilha e orégano" },
      { nome: "Brócolis c/ Bacon", descricao: "Mussarela, brócolis, bacon, alho e orégano" },
      { nome: "Caipira", descricao: "Mussarela, frango, milho, batata palha e orégano" },
      { nome: "Calabresa", descricao: "Mussarela, calabresa e orégano" },
      { nome: "Calabresa c/ Catupiry", descricao: "Mussarela, calabresa, catupiry e orégano" },
      { nome: "Calabresa c/ Cheddar", descricao: "Mussarela, calabresa, cheddar e orégano" },
      { nome: "Calabresa Mineira", descricao: "Mussarela, calabresa, bacon, milho e orégano" },
      { nome: "Canadense", descricao: "Mussarela, lombo canadense, champignon, catupiry e orégano" },
      { nome: "Catupiry", descricao: "Mussarela, catupiry e orégano" },
      { nome: "Champignon", descricao: "Mussarela, champignon e orégano" },
      { nome: "Champignon ao Alho", descricao: "Mussarela, champignon, alho e orégano" },
      { nome: "Chilena", descricao: "Mussarela, frango, milho, bacon, catupiry e orégano" },
      { nome: "Corn Bacon", descricao: "Mussarela, bacon, milho e orégano" },
      { nome: "Crocante", descricao: "Mussarela, bacon, batata palha e orégano" },
      { nome: "Do Pizzaiolo", descricao: "Mussarela, calabresa, tomate e pimentão" },
      { nome: "Eder", descricao: "Molho, mussarela, alho, catupiry, salsinha e orégano" },
      { nome: "Escarola c/ Bacon", descricao: "Mussarela, escarola, bacon, alho e orégano" },
      { nome: "Francesa", descricao: "Mussarela, presunto, bacon, milho, batata palha e orégano" },
      { nome: "Frango c/ Catupiry", descricao: "Mussarela, frango, catupiry e orégano" },
      { nome: "Frango c/ Cheddar", descricao: "Mussarela, frango, cheddar e orégano" },
      { nome: "Gorgonzola", descricao: "Mussarela, tomate, gorgonzola e orégano" },
      { nome: "Lombo", descricao: "Mussarela, lombo canadense e orégano" },
      { nome: "Lombo c/ Catupiry", descricao: "Mussarela, lombo canadense, catupiry e orégano" },
      { nome: "Lombo c/ Cheddar", descricao: "Mussarela, lombo canadense, cheddar e orégano" },
      { nome: "Marguerita", descricao: "Mussarela, tomate, manjericão e orégano" },
      { nome: "Mexicana", descricao: "Mussarela, calabresa, cebola, molho de pimenta e orégano" },
      { nome: "Milho", descricao: "Mussarela, milho e orégano" },
      { nome: "Mussarela", descricao: "Mussarela e orégano" },
      { nome: "Napolitana", descricao: "Mussarela, tomate, parmesão e orégano" },
      { nome: "Nonna Mia", descricao: "Mussarela, calabresa ralada, parmesão, alho e orégano" },
      { nome: "Palmito", descricao: "Mussarela, palmito e orégano" },
      { nome: "Paola", descricao: "Molho, mussarela, brócolis, catupiry e orégano" },
      { nome: "Parmegiana", descricao: "Mussarela, frango, molho, manjericão e orégano" },
      { nome: "Paulista", descricao: "Mussarela, palmito, ervilha, azeitona e orégano" },
      { nome: "Peruana", descricao: "Mussarela, atum, ervilha, cebola e orégano" },
      { nome: "Provolone", descricao: "Mussarela, provolone e orégano" },
      { nome: "Portuguesa", descricao: "Mussarela, presunto, cebola, ovo, azeitona e orégano" },
      { nome: "Rafael", descricao: "Molho, mussarela, catupiry, ovo e orégano" },
      { nome: "Romana", descricao: "Mussarela, presunto, tomate e orégano" },
      { nome: "Siciliana", descricao: "Mussarela, champignon, bacon, pimentão, azeitona e orégano" },
      { nome: "Tropical", descricao: "Mussarela, abacaxi, gorgonzola e orégano" },
    ],
  },
  {
    nome: "Doces",
    adicional: 0,
    sabores: [
      { nome: "Abacaxi", descricao: "Mussarela, leite condensado e abacaxi" },
      { nome: "Banana", descricao: "Banana e canela" },
      { nome: "Banana Nevada", descricao: "Banana e chocolate branco" },
      { nome: "Beijinho", descricao: "Mussarela, leite condensado, chocolate branco e coco" },
      { nome: "Brigadeiro", descricao: "Mussarela, leite condensado, brigadeiro e granulado" },
      { nome: "Califórnia", descricao: "Abacaxi, pêssego, figo, cereja e leite condensado" },
      { nome: "Chocolate Branco", descricao: "Mussarela, leite condensado e chocolate branco" },
      { nome: "Chocolate Preto", descricao: "Mussarela, leite condensado e chocolate preto" },
      { nome: "Confete Branco", descricao: "Mussarela, leite condensado, chocolate branco e confete" },
      { nome: "Confete Preto", descricao: "Mussarela, leite condensado, chocolate preto e confete" },
      { nome: "Dois Amores", descricao: "Mussarela, leite condensado, chocolate branco e chocolate preto" },
      { nome: "Floresta Negra", descricao: "Mussarela, leite condensado, chocolate preto e cereja" },
      { nome: "Kit Kat Branco", descricao: "Mussarela, leite condensado, chocolate branco e Kit Kat" },
      { nome: "Kit Kat Preto", descricao: "Mussarela, leite condensado, chocolate preto e Kit Kat" },
      { nome: "Sensação Branca", descricao: "Mussarela, leite condensado, chocolate branco e morango" },
      { nome: "Sensação Preta", descricao: "Mussarela, leite condensado, chocolate preto e morango" },
      { nome: "Paçoquinha Branca", descricao: "Mussarela, leite condensado, chocolate branco e paçoquinha" },
      { nome: "Piña Colada", descricao: "Mussarela, leite condensado, abacaxi, chocolate branco e coco" },
      { nome: "Prestígio", descricao: "Mussarela, leite condensado, chocolate preto e coco" },
    ],
  },
  {
    nome: "Nobres",
    adicional: 15,
    sabores: [
      { nome: "Falsa Light", descricao: "Mussarela, lombo, bacon, brócolis, cream cheese e orégano" },
      { nome: "Filé ao Alho e Óleo", descricao: "Mussarela, filé, alho e orégano" },
      { nome: "Nachos", descricao: "Mussarela, bolonhesa, cheddar, Doritos e orégano" },
      { nome: "Pepperoni", descricao: "Mussarela, pepperoni e orégano" },
      { nome: "Pepperoni Suprema", descricao: "Mussarela, pepperoni, champignon, parmesão, manjericão e orégano" },
      { nome: "Rúcula com Tomate Seco", descricao: "Mussarela, rúcula, tomate seco e orégano" },
      { nome: "Seis Queijos", descricao: "Mussarela, provolone, parmesão, catupiry, cheddar, gorgonzola e orégano" },
      { nome: "Strogonoff de Carne", descricao: "Mussarela, strogonoff de carne, batata palha e orégano" },
      { nome: "Strogonoff de Frango", descricao: "Mussarela, strogonoff de frango, batata palha e orégano" },
      { nome: "Vianna", descricao: "Mussarela, lombo canadense, queijo Polenguinho, tomate cereja e orégano" },
    ],
  },
  {
    nome: "Premium",
    adicional: 15,
    sabores: [
      { nome: "Adriano", descricao: "Molho, mussarela, carne seca, catupiry, banana, cheiro-verde e orégano" },
      { nome: "Aline", descricao: "Mussarela, leite condensado, cream cheese e geleia de amora" },
      { nome: "Churros", descricao: "Mussarela, leite condensado, chocolate preto e doce de leite sabor churros" },
      { nome: "Drica", descricao: "Molho, mussarela, gorgonzola, damasco, nozes e orégano" },
      { nome: "Débora", descricao: "Molho, mussarela, champignon, alho, provolone e orégano" },
      { nome: "Elizangela", descricao: "Molho, mussarela, pepperoni, alho, Doritos e orégano" },
      { nome: "Luiza", descricao: "Mussarela, leite condensado, chocolate branco e geleia de frutas vermelhas" },
      { nome: "Ricardo", descricao: "Molho, mussarela, tomate, linguiça, parmesão e orégano" },
      { nome: "Sabrina", descricao: "Molho, mussarela, carne seca, barbecue, cream cheese e orégano" },
      { nome: "Tassiane", descricao: "Cream cheese, goiabada e morango" },
      { nome: "Tia Nice", descricao: "Molho, mussarela, bacon, ameixa, cream cheese e orégano" },
    ],
  },
  {
    nome: "Gourmet",
    adicional: 15,
    sabores: [
      { nome: "Marguerita Premium", descricao: "Molho de tomate, queijo fior di latte, tomate cereja, manjericão e orégano", foto: "marguerita-premium.jpg" },
      { nome: "Da Chef", descricao: "Molho de tomate, presunto Parma, queijo stracciatella, tomate cereja, molho pesto e orégano", foto: "da-chef.jpg" },
      { nome: "Parma", descricao: "Molho de tomate, mozzarella, parmesão, queijo grana padano, rúcula, presunto Parma e orégano", adicional: 20, foto: "parma.jpg" },
      { nome: "Alho Negro", descricao: "Molho de tomate, mozzarella, parmesão, queijo burrata, alho negro, manjericão e orégano", adicional: 20, foto: "alho-negro.jpg" },
      { nome: "Vale dos Vinhedos", descricao: "Doce de leite, chocolate branco, uva verde sem semente e creme de leite", foto: "vale-dos-vinhedos.jpg" },
      // Lançamento: a arte não traz os ingredientes; completar no painel.
      { nome: "Costela", descricao: null, foto: "costela.jpg" },
    ],
  },
];

export const BAIRROS = [
  { nome: "Centro", taxa: 7 },
  { nome: "Nova Brasília", taxa: 12 },
  { nome: "Loteamento Dunka", taxa: 8 },
  { nome: "Loteamento São Lourenço", taxa: 9 },
  { nome: "Vila Nova", taxa: 8 },
  { nome: "Bom Jesus", taxa: 10 },
  { nome: "Lucena", taxa: 10 },
  { nome: "Km 27", taxa: 13 },
  { nome: "Paraguaçu", taxa: 15 },
  { nome: "Trevo", taxa: 20 },
  { nome: "JBS", taxa: 20 },
];

export const TELEFONE = "99923-3221";
