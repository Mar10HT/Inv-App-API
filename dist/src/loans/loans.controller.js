"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoansController = void 0;
const common_1 = require("@nestjs/common");
const loans_service_1 = require("./loans.service");
const create_loan_dto_1 = require("./dto/create-loan.dto");
const update_loan_dto_1 = require("./dto/update-loan.dto");
const guards_1 = require("../auth/guards");
const decorators_1 = require("../auth/decorators");
let LoansController = class LoansController {
    loansService;
    constructor(loansService) {
        this.loansService = loansService;
    }
    create(createLoanDto) {
        return this.loansService.create(createLoanDto);
    }
    findAll() {
        return this.loansService.findAll();
    }
    findActive() {
        return this.loansService.findActive();
    }
    getStats() {
        return this.loansService.getStats();
    }
    findByItem(itemId) {
        return this.loansService.findByItem(itemId);
    }
    findByWarehouse(warehouseId) {
        return this.loansService.findByWarehouse(warehouseId);
    }
    async isItemOnLoan(itemId) {
        const onLoan = await this.loansService.isItemOnLoan(itemId);
        return { onLoan };
    }
    findOne(id) {
        return this.loansService.findOne(id);
    }
    update(id, updateLoanDto) {
        return this.loansService.update(id, updateLoanDto);
    }
    returnLoan(id, returnLoanDto) {
        return this.loansService.returnLoan(id, returnLoanDto);
    }
    async remove(id) {
        await this.loansService.remove(id);
    }
    async checkOverdueLoans() {
        await this.loansService.checkOverdueLoans();
        return { message: 'Overdue loans checked and updated' };
    }
};
exports.LoansController = LoansController;
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, decorators_1.Roles)('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER', 'USER'),
    __param(0, (0, common_1.Body)(common_1.ValidationPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_loan_dto_1.CreateLoanDto]),
    __metadata("design:returntype", void 0)
], LoansController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], LoansController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('active'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], LoansController.prototype, "findActive", null);
__decorate([
    (0, common_1.Get)('stats'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], LoansController.prototype, "getStats", null);
__decorate([
    (0, common_1.Get)('item/:itemId'),
    __param(0, (0, common_1.Param)('itemId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], LoansController.prototype, "findByItem", null);
__decorate([
    (0, common_1.Get)('warehouse/:warehouseId'),
    __param(0, (0, common_1.Param)('warehouseId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], LoansController.prototype, "findByWarehouse", null);
__decorate([
    (0, common_1.Get)('check-item/:itemId'),
    __param(0, (0, common_1.Param)('itemId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], LoansController.prototype, "isItemOnLoan", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], LoansController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, decorators_1.Roles)('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(common_1.ValidationPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_loan_dto_1.UpdateLoanDto]),
    __metadata("design:returntype", void 0)
], LoansController.prototype, "update", null);
__decorate([
    (0, common_1.Patch)(':id/return'),
    (0, decorators_1.Roles)('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER', 'USER'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)(common_1.ValidationPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_loan_dto_1.ReturnLoanDto]),
    __metadata("design:returntype", void 0)
], LoansController.prototype, "returnLoan", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.NO_CONTENT),
    (0, decorators_1.Roles)('SYSTEM_ADMIN'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], LoansController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)('check-overdue'),
    (0, decorators_1.Roles)('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], LoansController.prototype, "checkOverdueLoans", null);
exports.LoansController = LoansController = __decorate([
    (0, common_1.Controller)('loans'),
    (0, common_1.UseGuards)(guards_1.JwtAuthGuard, guards_1.RolesGuard),
    __metadata("design:paramtypes", [loans_service_1.LoansService])
], LoansController);
//# sourceMappingURL=loans.controller.js.map