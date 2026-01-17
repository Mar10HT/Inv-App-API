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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReturnLoanDto = exports.UpdateLoanDto = exports.LoanStatus = void 0;
const class_validator_1 = require("class-validator");
var LoanStatus;
(function (LoanStatus) {
    LoanStatus["ACTIVE"] = "ACTIVE";
    LoanStatus["OVERDUE"] = "OVERDUE";
    LoanStatus["RETURNED"] = "RETURNED";
})(LoanStatus || (exports.LoanStatus = LoanStatus = {}));
class UpdateLoanDto {
    status;
    returnDate;
    notes;
}
exports.UpdateLoanDto = UpdateLoanDto;
__decorate([
    (0, class_validator_1.IsEnum)(LoanStatus),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateLoanDto.prototype, "status", void 0);
__decorate([
    (0, class_validator_1.IsDateString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateLoanDto.prototype, "returnDate", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateLoanDto.prototype, "notes", void 0);
class ReturnLoanDto {
    returnDate;
    notes;
}
exports.ReturnLoanDto = ReturnLoanDto;
__decorate([
    (0, class_validator_1.IsDateString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], ReturnLoanDto.prototype, "returnDate", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], ReturnLoanDto.prototype, "notes", void 0);
//# sourceMappingURL=update-loan.dto.js.map