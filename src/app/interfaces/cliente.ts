export interface ClienteRegistrado {
  tipo: "cliente_registrado";
  usuario_id: string;
  estado: "pendiente" | "activo" | "rechazado";
}

export interface ClienteAnonimo {
  tipo: "cliente_anonima";
  estado: "pendiente" | "activo";
}