export interface PedidoItem {
    productoId: number;
    tipo: "plato" | "bebida" | "postre";
    nombre: string;
    precioUnit: number;
    cantidad: number;
    duracionMin: number;
}