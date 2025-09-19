import { PedidoItem } from "./pedido-item";

export interface Pedido {
    id: string;
    mesaId: number;
    clienteUid: string;
    total: number;
    etaMinutos: number;
    estado: "pendiente" | "aceptado" | "rechazado";
    items: PedidoItem[];
}