export class User {
    id?: string;
    apellido: string;
    nombre: string;
    dni?: string;
    cuil?: string;
    email: string;
    perfil: string;

    constructor(apellido: string, nombre: string, email: string, perfil:string, dni?: string, cuil?: string, id?: string) {
        this.apellido = apellido;
        this.nombre = nombre;
        this.email = email;
        this.perfil = perfil;
        this.dni = dni;
        this.cuil = cuil;
        this.id = id;
    }
}
