"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const config_1 = require("prisma/config");
const isProd = process.env.NODE_ENV === "production";
const schemaPath = isProd ? "prisma/schema.prod.prisma" : "prisma/schema.prisma";
const migrationsPath = "prisma/migrations";
exports.default = (0, config_1.defineConfig)({
    schema: schemaPath,
    migrations: {
        path: migrationsPath,
    },
    datasource: {
        url: (0, config_1.env)("DATABASE_URL"),
    },
});
//# sourceMappingURL=prisma.config.js.map