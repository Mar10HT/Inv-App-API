import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BaseRepository, BaseRepositoryOptions } from '../common/repository';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService extends BaseRepository<CreateCategoryDto, UpdateCategoryDto> {
  protected readonly options: BaseRepositoryOptions = {
    modelName: 'category',
    defaultOrderBy: { name: 'asc' },
  };

  constructor(prisma: PrismaService) {
    super(prisma);
  }
}
