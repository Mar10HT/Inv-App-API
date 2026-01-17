import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import * as bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto) {
    const user = await this.usersService.findByEmail(loginDto.email);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = this.jwtService.sign(payload);

    return {
      access_token: accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  async register(registerDto: RegisterDto) {
    // Check if user already exists
    const existingUser = await this.usersService.findByEmail(registerDto.email);

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Create user with default USER role
    const newUser = await this.usersService.create({
      ...registerDto,
      role: UserRole.USER,
    });

    const payload = { sub: newUser.id, email: newUser.email, role: newUser.role };
    const accessToken = this.jwtService.sign(payload);

    return {
      access_token: accessToken,
      user: newUser,
    };
  }

  async validateUser(userId: string) {
    return this.usersService.findOne(userId);
  }

  async changePassword(userId: string, changePasswordDto: ChangePasswordDto) {
    const user = await this.usersService.findOneWithPassword(userId);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(
      changePasswordDto.currentPassword,
      user.password,
    );

    if (!isCurrentPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    // Check that new password is different from current
    const isSamePassword = await bcrypt.compare(
      changePasswordDto.newPassword,
      user.password,
    );

    if (isSamePassword) {
      throw new BadRequestException('New password must be different from current password');
    }

    // Hash and update the new password
    const hashedPassword = await bcrypt.hash(changePasswordDto.newPassword, 10);
    await this.usersService.updatePassword(userId, hashedPassword);

    return { message: 'Password changed successfully' };
  }
}
