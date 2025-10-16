import { Injectable } from "@angular/core";
import { Push } from "../push/push";
import { AuthService } from "../auth/auth";
import { Usuarios } from "../usuarios/usuarios";

@Injectable({ providedIn: "root" })
export class SesionPushService {
  private initialized = false;

  constructor(private push: Push, private auth: AuthService, private usuarios: Usuarios) {}

  async init() {
    if (this.initialized) return;
    const user = await this.auth.getUser();
    if (!user) return;
    const usuarioDB = await this.usuarios.getByEmail(user.email!);
    if (!usuarioDB) return;

    const role = (usuarioDB.perfil || "").toLowerCase();
    await this.push.init(usuarioDB.id ?? null, role as any);
    await this.push.ready();
    this.initialized = true;
  }
}
