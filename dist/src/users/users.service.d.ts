import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
export declare class UsersService {
    private prisma;
    constructor(prisma: PrismaService);
    create(createUserDto: CreateUserDto): Promise<{
        id: string;
        email: string;
        name: string | null;
        role: import("@prisma/client").$Enums.UserRole;
        createdAt: Date;
        updatedAt: Date;
    }>;
    findAll(): Promise<{
        id: string;
        email: string;
        name: string | null;
        role: import("@prisma/client").$Enums.UserRole;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    findOne(id: string): Promise<{
        id: string;
        email: string;
        name: string | null;
        role: import("@prisma/client").$Enums.UserRole;
        createdAt: Date;
        updatedAt: Date;
    }>;
    update(id: string, updateUserDto: UpdateUserDto): Promise<{
        id: string;
        email: string;
        name: string | null;
        role: import("@prisma/client").$Enums.UserRole;
        createdAt: Date;
        updatedAt: Date;
    }>;
    remove(id: string): Promise<void>;
    findByEmail(email: string): Promise<{
        id: string;
        email: string;
        password: string;
        name: string | null;
        role: import("@prisma/client").$Enums.UserRole;
        createdAt: Date;
        updatedAt: Date;
    } | null>;
    findOneWithPassword(id: string): Promise<{
        id: string;
        email: string;
        password: string;
    } | null>;
    updatePassword(id: string, hashedPassword: string): Promise<{
        id: string;
        email: string;
    }>;
}
