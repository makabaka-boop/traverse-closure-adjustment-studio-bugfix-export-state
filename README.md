# 闭合导线平差工作台

场地测量闭合导线常因毫米级误差回不到起点。本工具在**浏览器本地、完全离线**运行，
对东西（dx）、南北（dy）闭合差分别按各边**权重**执行**最大余数分配**，
输出整数毫米修正量，修正后两轴整数和**严格为零**，可逐毫米复算。

- 技术栈：TypeScript + React 18 + Vite 5，Vitest 测试，Docker Compose（nginx）托管
- 无后端、无外部网络请求、无 CDN，构建产物为纯静态文件

## 快速开始

### 本地开发

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest 全部用例
npm run build      # 类型检查 + 生产构建到 dist/
npm run preview    # 本地预览生产产物
```

### Docker Compose 运行 web

```bash
docker compose up --build -d
# 打开 http://localhost:8080
docker compose logs -f web
docker compose down
```

## 输入格式

顶层为 3–200 条**顺序边**的 JSON 数组，每条边字段必须**恰好**为：

| 字段     | 类型   | 约束                                      |
| -------- | ------ | ----------------------------------------- |
| `id`     | string | 非空、仅 ASCII、全数组唯一                |
| `dx`     | number | 整数，|dx| ≤ 10⁶（毫米，东西分量）        |
| `dy`     | number | 整数，|dy| ≤ 10⁶（毫米，南北分量）        |
| `weight` | number | 正整数（安全整数范围内，保证 BigInt 精确） |

```json
[
  { "id": "E1", "dx": 10, "dy": 5, "weight": 2 },
  { "id": "E2", "dx": -3, "dy": 5, "weight": 1 },
  { "id": "E3", "dx": -4, "dy": -8, "weight": 1 },
  { "id": "E4", "dx": 0, "dy": 0, "weight": 2 }
]
```

非法字段、类型错误、越界、非 ASCII id、重复 id、边数不在 3–200，均**拒绝整份数据**；
页面保留并继续展示**上次有效图形**，仅在错误条中说明原因。

## 平差算法（按权重的最大余数法）

东西、南北两个方向独立处理。对某一轴：

1. 闭合差 `f = Σ 原始分量`，待分配总额 `T = −f`（负闭合差下 T 为负），总权重 `W = Σ weight`。
2. 对每条边计算欧几里得整除的**下整商**与余数：
   `qᵢ = floor(T·wᵢ / W)`，`rᵢ = T·wᵢ − qᵢ·W`，恒有 `0 ≤ rᵢ < W`。
   > 注意：JavaScript BigInt 的 `/` 向零截断，负数时 `floor(-5/7)=-1 ≠ -5/7=0`，
   > 因此使用显式 floor 定义（见 `src/core/allocation.ts`）。
3. 先给每条边分 `qᵢ`；剩余 `R = T − Σqᵢ` 个单位（可证 `0 ≤ R < 边数`），
   依次分给余数 `rᵢ` 较大者；**余数相同按 id 的 UTF-8 字节序**（小者优先）。
4. 修正量 `cᵢ = qᵢ (+1)`，恒有 `Σcᵢ = T = −f`，故修正后该轴整数和严格为 0。

**整数精度**：全程使用 `BigInt`。weight 最大可取 2^53−1，`T·wᵢ` 可达约 1.8×10²⁴，
超出 Number 安全整数范围；下载 JSON 时采用 BigInt 安全序列化（不经过 Number 中转），
保证大整数结果逐位精确。

## 功能

- **叠画图**：灰色虚线为原始折线，红色细虚线为闭合差缺口，蓝色实线为平差后严格闭合折线；
  世界整数毫米网格（1/2/5 进制），DPR 适配，窗口缩放自动重绘。
- **逐边表格**：id、原始 dx/dy、weight、两轴修正量（带正负号）、平差后分量，
  页脚合计行显示修正量合计与平差后总和（必须为 0）。
- **下载 JSON**：包含闭合差、总权重与每条边的修正量和平差后分量，大整数以精确十进制
  字面量输出；另附 `totalWeightExact` 字符串字段，规避原生 `JSON.parse` 对 >2^53 数字的
  double 舍入（JS/JSON 固有限制）。修正量与平差后分量恒在安全整数范围内。
- **共享 / 下载画布**：支持 Web Share（含文件）时调系统分享面板，否则自动降级下载 PNG；
  两条出口均纯前端、离线可用。

## 目录结构

```
src/
  core/
    types.ts        # 领域类型
    allocation.ts   # 欧几里得 floor 整除 + 按权重最大余数分配（纯函数）
    adjustment.ts   # 两轴独立平差、闭合不变量校验（BigInt）
    parse.ts        # 严格输入校验：非法/重复 id 拒绝整份数据
    geometry.ts     # 折线顶点与包围盒
    utf8.ts         # id 的 UTF-8 字节序比较（同余数决胜）
    sample.ts       # 内置示例
  components/
    TraverseChart.tsx
    ResultTable.tsx
  utils/export.ts   # JSON（BigInt 安全）/ PNG 下载与 Web Share
  App.tsx
```

## 测试

`src/core/allocation.test.ts` 等覆盖规格点名的场景：

- **负闭合差**：T 为负时的 floor 商、余数与分配结果（两轴端到端）；
- **同余数决胜**：余数相同按 id UTF-8 字节序，前缀关系与字典序边界；
- **总和不变量**：数百组确定性随机权重/闭合差，`Σcᵢ ≡ T` 且 `amount−base ∈ {0,1}`；
- 严格解析（重复/非 ASCII id、非法字段、越界、3–200 边数）；
- React 集成：合法输入合计为 0、非法输入拒绝整份数据但保留上次有效图形。
