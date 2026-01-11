export declare class SeedController {
    private prisma;
    runSeed(): Promise<{
        success: boolean;
        message: string;
        credentials: {
            email: string;
            password: string;
        };
        error?: undefined;
    } | {
        success: boolean;
        error: any;
        message?: undefined;
        credentials?: undefined;
    }>;
}
