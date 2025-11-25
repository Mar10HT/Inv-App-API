export declare class StatsResponseDto {
    total: number;
    inStock: number;
    lowStock: number;
    outOfStock: number;
    totalValue: number;
    categories: {
        name: string;
        count: number;
    }[];
    locations: {
        name: string;
        count: number;
    }[];
}
