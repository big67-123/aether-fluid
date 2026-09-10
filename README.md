# Aether Fluid

> 零第三方库、纯手写 GLSL 的 **WebGL2 不可压缩流体模拟器**，一个可安装到主屏的 PWA，按 iPhone 17 Pro 的 ProMotion 120Hz 调校。

**线上地址：** https://big67-123.github.io/aether-fluid/

在 iPhone 上用 **Safari** 打开 → 分享 → **添加到主屏幕**，就会以全屏无工具栏的方式独立运行，并且第二次打开起完全离线可用。

---

## 这个项目里没有的东西

没有 three.js / regl / twgl / gl-matrix / dat.GUI / 任何 npm 运行时依赖。
没有图片素材（图标是 Node 标准库现场算出来并手写 PNG 编码的，见 `tools/make-icons.mjs`）。
没有构建步骤：源码就是发布物，`<script type="module">` 直接跑。

整个 `src/` 只有约 2 000 行 JavaScript 和约 400 行 GLSL。

---

## 物理模型

求解不可压缩 Navier–Stokes 方程，采用算子分裂（operator splitting）加 Chorin 投影法：

```
∂u/∂t = -(u·∇)u - ∇p + f      ∇·u = 0
```

每帧的 GPU 通道（全部是渲染到浮点纹理的全屏三角形，没有 compute shader）：

| # | Pass | 说明 |
|---|---|---|
| 1 | 速度自平流 | 二阶 **MacCormack**（BFECC 校正 + 单调性限制器），把数值耗散压到最低 |
| 2 | Curl | 涡量 ω = ∂v/∂x − ∂u/∂y |
| 3 | 涡度约束 | 沿 ∇\|ω\| 方向注入 ε(N × ω)，把被数值耗散吃掉的旋涡还回去 |
| 4 | 体积力 | 热浮力 + 染料自重 + 设备重力 + 静置自动搅动（同一趟算完） |
| 5 | 指针注入 | 最多 10 个高斯 splat 合并成**一趟**全屏 pass |
| 6 | 散度 | ∇·u 的中心差分 |
| 7 | 压力衰减 | 上一帧的压力场做暖启动（hot start），指数衰减到 0 |
| 8 | Jacobi 迭代 ×N | 解 Poisson 方程 ∇²p = ∇·u |
| 9 | 梯度减除 | u ← u − ∇p，同时把壁面法向速度压成 0（实心边界） |
| 10 | 染料 / 温度平流 | 与速度同阶的 MacCormack；α 通道是温度 |
| 11 | 泛光 | 1/4 分辨率的软阈值高光 + 5 抽头可分离高斯（等价 9 抽头） |
| 12 | 合成 | 吸光/发光两种混合、ACES、gamma、暗角、胶片颗粒 |

于是你看到的既不是「贴图在动」，也不是屏幕空间的小把戏：**翻卷的羽流、卡门涡街、涡丝拉伸都是压力投影逼出来的真实解**。

### 示踪粒子

另外还有 0–12 288 个拉格朗日示踪粒子，积分**完全在 GPU 上通过 WebGL2 transform feedback** 完成 —— 顶点着色器从 VBO 读粒子状态、采样速度场、把新状态直接写回另一个 VBO。CPU 每帧只发一次 `drawArrays`。

---

## 操控

| 操作 | 效果 |
|---|---|
| 手指按住拖动 | 注入速度 + 颜料 + 热量，指下流体被拖成涡丝 |
| 手指静止按住 | 持续注入热染料，浮力把它顶成上升羽流 |
| 多指同时 | 最多 10 路互不干扰的高斯注入 |
| 停止触摸 4 秒 | 自动搅动接管：两个反向旋转的涡源慢慢喂料，画面永不死掉 |
| 体感重力 | 面板里开启（iOS 会弹传感器授权），倾斜手机流体朝低处倒 |
| 底部小横条 | 上滑展开控制面板 |
| 键盘（桌面） | 空格暂停 · `R` 重置 · `S` 截图 · `H` 面板 · `M` HUD · `1`–`6` 切预设 |

---

## 六套预设

| 预设 | 性格 |
|---|---|
| **星云** | 默认档。冷色底 + 全彩染料，泛光拉满，示踪最活跃 |
| **水墨** | 宣纸底 + 吸光式颜料混合（Beer–Lambert），涡度最高，墨几乎不散 |
| **熔岩** | 强热浮力 + 快速降温，热羽流翻滚上升，高光溢出 |
| **烟** | 低饱和染料 + 负重量，像暗室里被光切开的香烟 |
| **霓虹** | 青紫双色 + 极低阻尼，涡线拉成发光细丝 |
| **极速** | 锁最低画质档，关粒子关泛光，把每一毫秒还给 120Hz |

---

## 自适应画质

`FrameClock` + `Governor` 会按住显示器刷新率把帧时间压在预算内。**下调快**（掉帧看得见，1.4s 冷却），**上调慢**（带滞回，连续 2.5s 有余量才升），不会来回抖。

| 档 | 网格长边 | Jacobi 迭代 | 平流阶数 | 泛光 | 粒子 | DPR |
|---|---|---|---|---|---|---|
| Ultra | 512 | 22 | 二阶 | 开 | 12 288 | 2.0 |
| High | 448 | 18 | 二阶 | 开 | 8 192 | 2.0 |
| Balanced | 384 | 15 | 二阶 | 开 | 6 144 | 1.75 |
| Lean | 320 | 12 | 二阶 | 开 | 4 096 | 1.5 |
| Lite | 256 | 10 | 一阶 | 关 | 2 048 | 1.25 |
| Survival | 192 | 8 | 一阶 | 关 | 0 | 1.0 |

刷新率**不是猜的**：启动时先渲染一帧（屏幕不空），然后跑 22 帧**什么都不画**的 `requestAnimationFrame`，取中位周期换算刷新率。只有空转测出来的才是干净的 vsync 周期 —— 这是唯一能可靠识别 ProMotion 面板跑在 120Hz 的办法。之后 15 秒内继续微调，然后冻结，避免某一帧特别快就把面板「骗」成高刷。

画质自动调节时**仿真状态不会丢**：网格重新分配用线性 blit 把速度场和染料场搬过去，画面不会闪。

---

## iOS / PWA 细节

- `apple-mobile-web-app-capable` + `black-translucent` 状态栏，配合 `viewport-fit=cover` 和 `env(safe-area-inset-*)`，刘海和灵动岛区域不压内容。
- `touch-action: none`、阻止 `gesturestart`、`-webkit-touch-callout: none` —— 没有橡皮筋回弹、没有双击缩放、没有长按弹菜单。
- **上下文丢失恢复**：iOS 会在切后台时毫不留情地回收 WebGL 上下文。`webglcontextlost` 会被拦下并暂停循环，`webglcontextrestored` 后重建全部 GL 对象、重新分配缓冲、继续跑。
- 切到后台自动停帧，回前台重置时钟，避免一帧巨大的 `dt` 把流体炸掉。
- `DeviceMotionEvent.requestPermission()` 在用户点「体感重力」时才申请，拒绝也不会静默失败，会弹提示。
- 重力方向按标准坐标系推导：加速度计读的是比力，静止时等于 −g；屏幕「下」是 −y_device，所以世界重力 = `(−a.x, −a.y) × gain`。手机平放桌上流体不受力，竖着拿流体往下落，右边缘朝下流体往右倒。
- 低电量模式下 ProMotion 会锁 60Hz，启动探测会如实读到 60Hz，画质自动相应调整。

---

## 目录结构

```
index.html                 外壳 + iOS meta
manifest.webmanifest       PWA 清单（相对路径，子目录部署安全）
sw.js                      Service Worker：网络优先 + 缓存兜底
src/
  main.js                  应用外壳：生命周期、分辨率策略、帧循环、交互
  style.css                iOS 优先的玻璃质感 UI
  core/
    glx.js                 上下文创建、能力探测、格式选择
    program.js             编译/链接（含 transform feedback varyings）+ uniform 缓存
    target.js              texStorage2D 渲染目标、双缓冲、带 blit 的 resize
    quad.js                一个全屏三角形，零属性（位置来自 gl_VertexID）
    clock.js               帧时钟、刷新率探测、自适应画质调度器
  glsl/
    common.js              共享顶点阶段、fragment 前导、hash
    fluid.js               平流/涡度/散度/Jacobi/梯度/体积力/splat
    display.js             泛光预过滤、可分离模糊、最终合成
    particles.js           粒子积分（TF）与点精灵绘制
  sim/
    fluid.js               求解器管线与渲染目标编排
    particles.js           transform feedback 粒子系统的 CPU 侧
    presets.js             全部可调参数的唯一真源 + 六套预设
  input/
    pointer.js             多点触控（含 PointerEvent 缺失时的 touch 回退）
    motion.js              陀螺仪 → 真实重力项
  ui/
    dom.js  hud.js  panel.js
tools/make-icons.mjs       纯 Node（zlib + 手写 CRC32）生成全部 PNG 图标
```

---

## 本地跑

源码就是发布物，任何静态服务器都行，例如 `python -m http.server`。

要重新生成图标：`node tools/make-icons.mjs`。

注意 Service Worker（离线缓存、安装到主屏）只在 **https 或 localhost** 下生效 —— 局域网 http 能玩，但装不到主屏。所以正式使用走 GitHub Pages。

---

## 验证记录

在真实 Chromium（Edge，Playwright）里跑过并目视检查截图：

- 全部 13 个着色器程序编译链接通过，运行时无异常；
- 首屏 12 次随机 splat 播种 → 静置自动搅动接管 → 画面持续演化；
- 脚本化环形拖拽（临时自测代码，验证后已删除）确认指针注入路径：速度场松弛写入、染料累积、MacCormack 拉出细丝、涡度约束维持锐度；
- 自适应调度器在软件渲染（SwiftShader）下如实从 High 一路降到 Survival，说明预算控制真的在动；
- 面板/HUD/预设/滑杆绑定与数值回显正常；
- 图标由 `node tools/make-icons.mjs` 生成并已人工查看。

**没能在这个环境里验证的**（无头浏览器没有触摸屏和运动传感器）：

- 真机多点触控的手感与惯性；
- iOS 陀螺仪授权与重力方向的实机观感（坐标推导见上文，若方向反了改 `motion.js` 里 `gain` 的符号即可）；
- 上下文丢失恢复的真机路径；
- iPhone 17 Pro 上的实际帧率数值。

---

## 已知限制

- 需要 WebGL2 + 可渲染的半浮点纹理（iOS 15+ / 现代桌面浏览器）。不满足时会显示明确的错误页而不是白屏。
- Jacobi 迭代做压力求解，不是多重网格；在极低压力迭代档位下大尺度上会略显可压缩。这是为移动端帧率做的取舍。
- 二维求解。没有体积光步进（那是「视觉炸裂」路线的另一半，本次没做）。

---

MIT
