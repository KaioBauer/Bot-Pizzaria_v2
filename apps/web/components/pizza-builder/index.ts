// Montagem visual reaproveitável (pizza hoje; lanche empilhado no futuro).
// Só apresentação e efeitos: preço, carrinho e checkout ficam em app/pedir.
export { Bandeja, vibrar, type OpcaoBandeja } from "./bandeja";
export { CAMADAS_BASE, ehDoce, coresDaBorda, miniaturaDoSabor, visuaisDaDescricao, visuaisDoSabor, visualDoNome, VISUAIS, type BaseSabor, type CoresBorda, type TipoCamada, type Visual } from "./biblioteca";
export { Flutuantes, TotalAnimado, useFlutuantes, usePrecarregar, usePreferenciaSom, usarSom } from "./efeitos";
export { escalaDoTamanho } from "./geometria";
export { IMAGENS_CENARIO, Palco } from "./palco";
export { AnelDeRecheio, BASE_PADRAO, Pizza, type BasePizza, type Camada, type CamadaVisual, type PizzaProps } from "./pizza";
