import { PedidoItem } from "./pedido-item";

export interface Pedido {
    id: string;
    mesaId: number;
    clienteUid: string;
    total: number;
    etaMinutos: number;
    estado: "en_espera" | "pendiente" | "aceptado" | "rechazado" | "recibido" | "terminado" | "impagado" | "pagado";
    items: PedidoItem[];
}