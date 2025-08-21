"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.newCommand = newCommand;
var core_1 = require("@ampsm/core");
function newCommand(options) {
    return __awaiter(this, void 0, void 0, function () {
        var dbPath, store, manager, threadId, modelOverride, createOptions, session, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    dbPath = process.env.AMPSM_DB_PATH || (0, core_1.getDbPath)();
                    store = new core_1.SessionStore(dbPath);
                    manager = new core_1.WorktreeManager(store);
                    return [4 /*yield*/, (0, core_1.getCurrentAmpThreadId)()];
                case 1:
                    threadId = _a.sent();
                    modelOverride = options.model;
                    if (options.gpt5 && options.alloy) {
                        console.error('Error: Cannot specify both --gpt5 and --alloy flags');
                        process.exit(1);
                    }
                    if (options.gpt5) {
                        modelOverride = 'gpt-5';
                    }
                    else if (options.alloy) {
                        modelOverride = 'alloy';
                    }
                    createOptions = {
                        name: options.name,
                        ampPrompt: options.prompt,
                        repoRoot: options.repo,
                        baseBranch: options.base || 'main',
                        scriptCommand: options.script,
                        modelOverride: modelOverride,
                        threadId: threadId || undefined
                    };
                    console.log("Creating session \"".concat(options.name, "\"..."));
                    return [4 /*yield*/, manager.createSession(createOptions)];
                case 2:
                    session = _a.sent();
                    console.log("\u2713 Session created: ".concat(session.id));
                    console.log("  Branch: ".concat(session.branchName));
                    console.log("  Worktree: ".concat(session.worktreePath));
                    store.close();
                    return [3 /*break*/, 4];
                case 3:
                    error_1 = _a.sent();
                    console.error('Error creating session:', error_1);
                    process.exit(1);
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
