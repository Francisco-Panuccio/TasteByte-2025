export class User {
    id?: number;
    apellido: string;
    nombre: string;
    dni?: number;
    cuil?: number;
    email: string;
    perfil: string;

    constructor(apellido: string, nombre: string, email: string, perfil:string, dni?: number, cuil?: number, id?: number) {
        this.apellido = apellido;
        this.nombre = nombre;
        this.email = email;
        this.perfil = perfil;
        this.dni = dni;
        this.cuil = cuil;
        this.id = id;
    }
}
