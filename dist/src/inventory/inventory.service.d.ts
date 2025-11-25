import { PrismaService } from '../prisma/prisma.service';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { FilterInventoryDto } from './dto/filter-inventory.dto';
import { PaginatedResponseDto } from './dto/paginated-response.dto';
import { StatsResponseDto } from './dto/stats-response.dto';
import { InventoryItem } from '@prisma/client';
export declare class InventoryService {
    private prisma;
    constructor(prisma: PrismaService);
    create(createInventoryDto: CreateInventoryDto): Promise<InventoryItem>;
    findAll(filters?: FilterInventoryDto): Promise<PaginatedResponseDto<InventoryItem>>;
    findOne(id: string): Promise<InventoryItem>;
    update(id: string, updateInventoryDto: UpdateInventoryDto): Promise<InventoryItem>;
    remove(id: string): Promise<void>;
    getStats(): Promise<StatsResponseDto>;
    getLowStockItems(): Promise<InventoryItem[]>;
    getCategories(): Promise<string[]>;
    getLocations(): Promise<string[]>;
}
