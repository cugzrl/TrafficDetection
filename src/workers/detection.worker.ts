import * as ort from 'onnxruntime-web';

ort.env.wasm.numThreads = 1; 
// 使用绝对URL路径
ort.env.wasm.wasmPaths = self.location.origin + '/ort-wasm/';

let session: ort.InferenceSession | null = null;

const classNames = [
  '汽车', 
  '三轮车', 
  '面包车', 
  '公交车', 
  '行人', 
  '骑自行车的人', 
  '骑电动车的人'
]; 

self.onmessage = async (e: MessageEvent) => {
  const { type, payload } = e.data;

  if (type === 'init') {
    try {
      session = await ort.InferenceSession.create('/detection_dair.onnx', { executionProviders: ['webgpu', 'wasm'] });
      self.postMessage({ type: 'init_done' });
    } catch (error: any) {
      console.error("ONNX Runtime 初始化异常:", error);
      self.postMessage({ type: 'error', error: error.message });
    }
  }

  if (type === 'detect') {
    if (!session) {
      self.postMessage({ type: 'error', error: 'Session not initialized' });
      return;
    }
    
    const { imageData } = payload;
    
    try {
      // 1. 预处理 (Resize to 640x640+归一化)
      const tensor = preprocess(imageData);
      
      // 2. 推理
      const feeds: Record<string, ort.Tensor> = {};
      const inputName = session.inputNames[0];
      feeds[inputName] = tensor;
      const results = await session.run(feeds);
      
      // 3. 后处理 (解析Bounding Boxes)
      const boxes = postprocess(results, imageData.width, imageData.height);
      
      // 将结果发回主线程
      self.postMessage({ type: 'detect_done', payload: boxes });
    } catch (error: any) {
      console.error("推理异常:", error);
      self.postMessage({ type: 'error', error: error.message });
    }
  }
};

/**
 * 图像预处理: ImageData -> Tensor [1, 3, 640, 640]
 * 使用最近邻插值缩放，将像素值归一化至 0.0 ~ 1.0 (float32)
 */
function preprocess(imageData: ImageData): ort.Tensor {
  const { data, width, height } = imageData;
  const targetSize = 640;
  const float32Data = new Float32Array(3 * targetSize * targetSize);
  
  const scaleX = width / targetSize;
  const scaleY = height / targetSize;

  for (let y = 0; y < targetSize; y++) {
    for (let x = 0; x < targetSize; x++) {
      const srcX = Math.floor(x * scaleX);
      const srcY = Math.floor(y * scaleY);
      const srcIndex = (srcY * width + srcX) * 4;
      
      const destIndex = y * targetSize + x;
      
      // R通道
      float32Data[destIndex] = data[srcIndex] / 255.0;
      // G通道
      float32Data[targetSize * targetSize + destIndex] = data[srcIndex + 1] / 255.0;
      // B通道
      float32Data[2 * targetSize * targetSize + destIndex] = data[srcIndex + 2] / 255.0;
    }
  }
  
  return new ort.Tensor('float32', float32Data, [1, 3, targetSize, targetSize]);
}

/**
 * 结果后处理: 解析模型输出的Tensor并还原到原始画面坐标
 */
function postprocess(results: any, origWidth: number, origHeight: number) {
  const boxes: any[] = [];
  
  console.log("模型输出节点:", Object.keys(results));

  let boxesTensor: ort.Tensor | null = null;
  let scoresTensor: ort.Tensor | null = null;

  for (const key in results) {
    const tensor = results[key];
    const dims = tensor.dims;
    console.log(`节点 ${key} 维度:`, dims);
    
    // 假设 [1, 300, 4] 或者 [1, 300, 6] 是 boxes 相关的
    if (dims.length === 3 && dims[2] === 4) {
      boxesTensor = tensor;
    } 
    // 假设 [1, 300, num_classes] 是 scores
    else if (dims.length === 3 && dims[2] > 4) {
      scoresTensor = tensor;
    }
    // 如果单个节点输出了 [1, 300, 6] (带有类别和置信度)
    else if (!boxesTensor && dims.length === 3 && dims[2] >= 5) {
      boxesTensor = tensor;
    }
  }

  if (!boxesTensor) {
    console.warn("未找到 Boxes 输出节点");
    return boxes;
  }

  const bData = boxesTensor.data as Float32Array;
  const bDims = boxesTensor.dims; 
  
  // 如果模型只有单个输出节点，比如 [1, 300, 6] 包含框和置信度类别
  if (bDims.length === 3 && bDims[2] >= 5) {
    const numBoxes = bDims[1];
    const numFields = bDims[2];
    
    for (let i = 0; i < numBoxes; i++) {
      const offset = i * numFields;
      const x = bData[offset];
      const y = bData[offset + 1];
      const w = bData[offset + 2];
      const h = bData[offset + 3];
      let conf = bData[offset + 4];
      let cls = bDims[2] > 5 ? bData[offset + 5] : 0; 
      
      if (conf > 0.4) {
        pushBox(boxes, x, y, w, h, conf, cls, origWidth, origHeight);
      }
    }
  } 
  // 如果模型是双输出，一个 [1, 300, 4] 框，一个 [1, 300, num_classes] 概率
  else if (bDims.length === 3 && bDims[2] === 4 && scoresTensor) {
    const sData = scoresTensor.data as Float32Array;
    const sDims = scoresTensor.dims;
    const numBoxes = bDims[1];
    const numClasses = sDims[2];

    for (let i = 0; i < numBoxes; i++) {
      const bOffset = i * 4;
      const sOffset = i * numClasses;

      // 寻找当前框的最大分类概率
      let maxConf = 0;
      let maxCls = -1;
      for (let c = 0; c < numClasses; c++) {
        const conf = sData[sOffset + c];
        if (conf > maxConf) {
          maxConf = conf;
          maxCls = c;
        }
      }

      if (maxConf > 0.4) {
        const x = bData[bOffset];
        const y = bData[bOffset + 1];
        const w = bData[bOffset + 2];
        const h = bData[bOffset + 3];
        pushBox(boxes, x, y, w, h, maxConf, maxCls, origWidth, origHeight);
      }
    }
  } else {
    console.warn("未能解析的 Tensor 维度: ", bDims);
  }

  console.log("检测到框数量:", boxes.length);
  return boxes;
}

function pushBox(boxes: any[], x: number, y: number, w: number, h: number, conf: number, cls: number, origWidth: number, origHeight: number) {
  // 判断网络输出是绝对坐标还是 0~1 的归一化坐标
  const isNormalized = w <= 1.0 && h <= 1.0;
  
  let realX = isNormalized ? x * origWidth : (x / 640) * origWidth;
  let realY = isNormalized ? y * origHeight : (y / 640) * origHeight;
  let realW = isNormalized ? w * origWidth : (w / 640) * origWidth;
  let realH = isNormalized ? h * origHeight : (h / 640) * origHeight;
  
  // 假设导出的坐标是中心点 (cx, cy)
  const boxX = realX - realW / 2;
  const boxY = realY - realH / 2;
  
  const typeIndex = Math.floor(cls);
  const typeName = classNames[typeIndex] || `目标${typeIndex}`;

  console.log("坐标:", boxX, boxY, realW, realH);
  console.log("类型:", typeName);
  console.log("置信度:", conf.toFixed(2));
  console.log("类别:", cls);
  //console.log("原始宽度:", origWidth);
  //console.log("原始高度:", origHeight);
  //console.log("是否归一化:", isNormalized);
  //console.log("归一化宽度:", realW);
  //console.log("归一化高度:", realH);

  boxes.push({
    x: boxX,
    y: boxY,
    width: realW,
    height: realH,
    confidence: conf.toFixed(2),
    type: typeName
  });
}
