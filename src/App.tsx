import React, { useState } from 'react';
import { GoogleGenAI, Type as GenAIType } from '@google/genai';
import { FileText, Upload, FileUp, File as FileIcon, Type as TypeIcon, Loader2, Download, Scale, Trash2, Tag, Search, CheckCircle2, Edit3 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { processFile } from './utils/fileProcessor';
import { downloadAsWord } from './utils/wordGenerator';
import { Template, CaseElements } from './types';

export default function App() {
  // 1. Template Management State
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [newTemplateFile, setNewTemplateFile] = useState<File | null>(null);
  const [newTemplateTags, setNewTemplateTags] = useState('');
  const [templateSearch, setTemplateSearch] = useState('');

  // 2. Case Extraction State
  const [caseFile, setCaseFile] = useState<File | null>(null);
  const [caseText, setCaseText] = useState('');
  const [caseElements, setCaseElements] = useState<CaseElements | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);

  // 3. Generation State
  const [specialRequirements, setSpecialRequirements] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedLetter, setGeneratedLetter] = useState('');
  const [legalAnalysis, setLegalAnalysis] = useState('');
  const [error, setError] = useState('');

  const filteredTemplates = templates.filter(t =>
    t.name.toLowerCase().includes(templateSearch.toLowerCase()) || 
    t.tags.some(tag => tag.toLowerCase().includes(templateSearch.toLowerCase()))
  );

  const handleAddTemplate = () => {
    if (!newTemplateFile) return;
    const tags = newTemplateTags.split(/[,，]/).map(t => t.trim()).filter(t => t);
    const newTemplate: Template = {
      id: Date.now().toString(),
      name: newTemplateFile.name,
      file: newTemplateFile,
      tags
    };
    setTemplates([...templates, newTemplate]);
    setNewTemplateFile(null);
    setNewTemplateTags('');
  };

  const handleDeleteTemplate = (id: string) => {
    setTemplates(templates.filter(t => t.id !== id));
    if (selectedTemplateId === id) {
      setSelectedTemplateId(null);
    }
  };

  const handleExtract = async () => {
    if (!caseFile && !caseText.trim()) {
      setError('请提供案情描述（上传文件或手动输入）以供提取。');
      return;
    }
    setError('');
    setIsExtracting(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const parts: any[] = [];
      parts.push({ text: '请提取以下案情描述（或上传的文件）中的核心要素，并以JSON格式返回。特别注意：\n1. 请务必从提供的材料中详细提取各股东的信息（包括但不限于股东姓名/名称、认缴出资金额、实缴出资金额、增资金额、出资期限等）。\n2. 在分析案情和提取要素时，如涉及法律适用，请务必增加一个内部核对过程，确保引用的法条（特别是2024年7月1日施行的新《公司法》）为现行有效版本，且法条内容适用正确，严禁错引或捏造。' });

      if (caseFile) {
        const processedCase = await processFile(caseFile);
        parts.push(processedCase);
      }
      if (caseText.trim()) {
        parts.push({ text: `【补充案情描述】：\n${caseText}` });
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: GenAIType.OBJECT,
            properties: {
              parties: { type: GenAIType.STRING, description: "当事人信息（如委托人、相对方等）" },
              shareholders: { type: GenAIType.STRING, description: "详细的股东信息（包括股东姓名/名称、认缴出资金额、实缴出资金额、增资金额、出资期限等，务必从文件中提取）" },
              focus: { type: GenAIType.STRING, description: "争议焦点" },
              facts: { type: GenAIType.STRING, description: "主要事实经过" },
              evidence: { type: GenAIType.STRING, description: "证据要点" }
            },
            required: ["parties", "shareholders", "focus", "facts", "evidence"]
          },
          tools: [{ googleSearch: {} }]
        }
      });

      if (response.text) {
        setCaseElements(JSON.parse(response.text));
      } else {
        setError('提取失败，未返回内容。');
      }
    } catch (err: any) {
      console.error(err);
      const errorMessage = err.message || '';
      if (errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
        setError('API 额度已用尽 (429 Quota Exceeded)。请稍后再试，或检查您的 Gemini API 计费状态。');
      } else {
        setError(`提取过程中发生错误: ${errorMessage || '未知错误'}`);
      }
    } finally {
      setIsExtracting(false);
    }
  };

  const handleGenerate = async () => {
    if (!caseElements) {
      setError('请先提取并确认案情要素。');
      return;
    }

    setError('');
    setIsGenerating(true);
    setGeneratedLetter('');
    setLegalAnalysis('');

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      // --- STEP 1: Legal Analysis ---
      const analysisParts = [
        { text: `当前时间是 **2026年**。你是一个中国大陆的资深律师。
请在起草律师函之前，先对本案的法条适用进行严谨的【法律适用与正确性分析】。

【案情要素】：
当事人信息：${caseElements.parties}
涉案股东详细信息：${caseElements.shareholders}
争议焦点：${caseElements.focus}
主要事实：${caseElements.facts}
证据要点：${caseElements.evidence}
特殊要求：${specialRequirements}

【分析任务】：
1. **官方来源双重比对核验（核心防错机制）**：
   - 必须使用联网检索功能，检索现行有效的《中华人民共和国公司法》（由第十四届全国人大常委会第七次会议于2023年12月29日修订，2024年7月1日起施行）。
   - **强制要求**：但凡拟适用的每一个法条，必须至少从**两个不同的官方或权威来源**（如中国人大网、中国政府网、最高人民法院、司法部等）分别获取法条内容。
   - **必须在报告中明确展示比对过程**：列出“来源A（附链接/出处）”的法条内容，和“来源B（附链接/出处）”的法条内容，并进行逐字比对。
   - 只有在两个来源的内容完全一致的情况下，才能确认该法条内容正确。严禁使用未经双重比对或比对不一致的法条。
2. **法条适用性分析**：结合本案的具体情形，深度分析上述经过双重比对确认无误的法条，是否能够适用到当前情形中（例如：追加股东承担补充赔偿责任或连带责任的法律依据是否充分，行政处罚的威慑力是否适用）。

请输出结构清晰、逻辑严密的《法律适用与正确性分析报告》，报告中必须包含专门的【法条双重比对核验过程】章节。` }
      ];

      const analysisResponse = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: { parts: analysisParts },
        config: { temperature: 0.2, tools: [{ googleSearch: {} }] }
      });

      const analysisText = analysisResponse.text || '';
      setLegalAnalysis(analysisText);

      // --- STEP 2: Drafting ---
      const parts: any[] = [];

      const selectedTemplate = templates.find(t => t.id === selectedTemplateId);
      if (selectedTemplate) {
        parts.push({ text: '【律师函模板参考】\n请严格参考以下模板的格式、用词和行文风格：' });
        const processedTemplate = await processFile(selectedTemplate.file);
        parts.push(processedTemplate);
      }

      parts.push({ text: `\n【已确认的案情要素】
当事人信息：${caseElements.parties}
涉案股东详细信息：${caseElements.shareholders}
争议焦点：${caseElements.focus}
主要事实：${caseElements.facts}
证据要点：${caseElements.evidence}` });

      if (specialRequirements.trim()) {
        parts.push({ text: `\n【特殊要求】\n${specialRequirements}` });
      }

      parts.push({
        text: `\n【前置法律分析报告】\n以下是你刚刚完成的法律分析，请严格基于此报告中确认适用且内容正确的法条来起草律师函：\n${analysisText}`
      });

      const LAW_DATABASE: Record<string, string> = {
        '【法条_23】': '公司股东滥用公司法人独立地位和股东有限责任，逃避债务，严重损害公司债权人利益的，应当对公司债务承担连带责任。股东利用其控制的两个以上公司实施前款规定行为的，各公司应当对任一公司的债务承担连带责任。只有一个股东的公司，股东不能证明公司财产独立于股东自己的财产的，应当对公司债务承担连带责任。',
        '【法条_53】': '公司成立后，股东不得抽逃出资。违反前款规定的，股东应当返还抽逃的出资；给公司造成损失的，负有责任的董事、监事、高级管理人员应当与该股东承担连带赔偿责任。',
        '【法条_88】': '股东转让已认缴出资但未届出资期限的股权的，由受让人承担缴纳该出资的义务；受让人未按期足额缴纳出资的，转让人对受让人未按期缴纳的出资承担补充责任。未按照公司章程规定的实际缴纳出资，或者实际出资的非货币财产的实际价额显著低于所认缴的出资额的股东转让股权的，转让人与受让人在出资不足的范围内承担连带责任；受让人不知道且不应当知道存在上述情形的，由转让人承担责任。',
        '【法条_252】': '公司的发起人、股东虚假出资，未交付或者未按期交付作为出资的货币或者非货币财产的，由公司登记机关责令改正，可以处以五万元以上二十万元以下的罚款；情节严重的，处以虚假出资金额百分之五以上百分之十五以下的罚款；对直接负责的主管人员和其他直接责任人员处以一万元以上十万元以下的罚款。',
        '【法条_253】': '公司的发起人、股东在公司成立后，抽逃其出资的，由公司登记机关责令改正，处以所抽逃出资金额百分之五以上百分之十五以下的罚款；对直接负责的主管人员和其他直接责任人员处以一万元以上十万元以下的罚款。'
      };

      parts.push({
        text: `\n【时间背景设定】
当前时间是 **2026年**。2023年修订的《中华人民共和国公司法》早已于2024年7月1日生效并适用至今。
请在行文中体现这是现行有效的法律，直接称呼为《中华人民共和国公司法》，**绝对不要**使用“即将施行”、“新修订”、“新《公司法》”等过时表述。

【最高优先级强制指令：法条占位符替换机制与官方来源声明】
为了100%彻底杜绝法条引用错误，系统已启用“代码级法条替换机制”。
**你在起草律师函时，凡涉及以下《公司法》核心法条，严禁输出法条的具体内容文字！**
你必须且只能使用对应的【占位符】，系统会在最终渲染时自动将占位符替换为绝对正确的官方原文。

**同时，在第一次引用《公司法》时，必须明确写出官方来源声明：**
“根据由第十四届全国人民代表大会常务委员会第七次会议于2023年12月29日修订，自2024年7月1日起施行的《中华人民共和国公司法》...”

- 引用第二十三条（财产混同），请写：根据《中华人民共和国公司法》第二十三条规定：“【法条_23】”
- 引用第五十三条（抽逃出资），请写：根据《中华人民共和国公司法》第五十三条规定：“【法条_53】”
- 引用第八十八条（瑕疵股权转让），请写：根据《中华人民共和国公司法》第八十八条规定：“【法条_88】”
- 引用第二百五十二条（虚假出资处罚），请写：根据《中华人民共和国公司法》第二百五十二条规定：“【法条_252】”
- 引用第二百五十三条（抽逃出资处罚），请写：根据《中华人民共和国公司法》第二百五十三条规定：“【法条_253】”

示例：
错误写法：根据《公司法》第五十三条规定：“公司成立后，股东不得抽逃出资...” （严禁这样写！）
正确写法：根据由第十四届全国人民代表大会常务委员会第七次会议于2023年12月29日修订，自2024年7月1日起施行的《中华人民共和国公司法》第五十三条规定：“【法条_53】”

【法条引用规范】
除了上述核心法条使用占位符外，如果案情需要引用其他《公司法》法条，**必须严格基于前置《法律适用与正确性分析报告》中经过双重比对确认无误的法条原文进行引用**，绝不能凭空捏造或使用未经比对的法条。

【任务指令】
你是一个中国大陆的资深律师，就职于“四川环信律师事务所”。请根据以上确认的案情要素，起草一份专业的律师函。
本律师函的特定应用场景：
1. 针对被执行人为公司的执行案件“终本”后，申请执行人向该公司可能涉嫌抽逃注册资本、虚假出资或财产混同的各股东发送。
2. 核心诉求是要求上述股东在违法行为范围内承担补充赔偿责任或连带清偿责任。
3. 为了增加对方付款的压力和可能性，必须**着重强调“抽逃注册资本”的严重法律责任**，形成多维度的强力威慑。具体威慑要求如下：
   (1) **民事责任必须严厉指出**：明确指出抽逃出资的股东应当在抽逃出资本息范围内对公司债务不能清偿的部分承担补充赔偿责任，且协助抽逃的其他股东、董事、高级管理人员或者实际控制人对此承担连带责任。
   (2) **行政纠错的具体金额必须明确写入**：明确指出公司登记机关将责令退还抽逃的注册资本，并在函件中写明具体的抽逃金额（精确到元）。
   (3) **行政处罚的金额必须往最高金额写**：根据新《公司法》第二百五十三条等规定（抽逃出资的，处以抽逃出资金额5%-15%的罚款，对直接负责的主管人员和其他直接责任人员处以1万-10万的罚款），直接按**最高比例（15%）和最高金额（10万）**计算并写明具体的最高罚款金额，以达到最大威慑。
   (4) **行政强制执行的内容必须具体化**：明确指出如果拒不缴纳上述行政罚款和拒不退还抽逃出资，行政机关将申请人民法院强制执行，具体手段包括但不限于查封、冻结、扣划其个人名下的银行存款、微信支付宝余额，甚至拍卖其房产、车辆等个人财产，突出对**行政处罚和纠错金额的强制执行**后果。

要求：
1. 必须符合中国大陆现行有效的最新法律法规和政策（特别是2024年7月1日施行的新《公司法》关于股东出资责任、抽逃出资、财产混同的规定）。
2. **严格核对法条（双重校验机制）**：
   - **机制一：强制使用占位符**。凡涉及上述核心法条，必须使用占位符。
   - **机制二：严禁引用其他法条**。除了上述核心法条外，严禁引用任何其他《公司法》法条。
3. 语气要专业、严厉、具有极强的法律威慑力。
4. 案情细节请严格按照提供的要素，不要随意捏造关键事实，但必须补充相关的法律套话、法条引用以及上述要求的行政责任威慑。
5. **绝对不要**在函件中提及“破产”相关的任何内容。
6. **绝对不要**在函件中提及“出资加速到期”相关的任何内容。
7. 必须满足用户的特殊要求。
8. 请直接输出律师函的正文内容（包含称呼、正文、落款）。
9. **绝对不要**在开头输出“四川环信律师事务所”和“律师函”的大标题，系统会自动添加。`
      });

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: { parts },
        config: {
          temperature: 0.0, // Set to 0.0 for maximum determinism and strict adherence to the prompt
          tools: [{ googleSearch: {} }]
        }
      });

      if (response.text) {
        // Pass 2: Proofreading and Placeholder Enforcement
        const proofreadParts = [
          { text: `请对以下律师函进行最终的严格校对和格式化。
【核心任务一：强制替换为法条占位符】
为了保证系统最终输出的法条100%准确，你需要将律师函中引用的特定《公司法》条文内容，替换为系统指定的占位符。
请仔细扫描下文，如果发现引用了以下法条，**请务必将其具体内容（引号内的文字）全部删除，并替换为对应的占位符**：
- 发现引用第二十三条（或第23条），将其内容替换为：【法条_23】
- 发现引用第五十三条（或第53条），将其内容替换为：【法条_53】
- 发现引用第八十八条（或第88条），将其内容替换为：【法条_88】
- 发现引用第二百五十二条（或第252条），将其内容替换为：【法条_252】
- 发现引用第二百五十三条（或第253条），将其内容替换为：【法条_253】

例如，如果原文是：
根据《中华人民共和国公司法》第五十三条规定：“公司成立后，股东不得抽逃出资...”
你需要将其修改为：
根据《中华人民共和国公司法》第五十三条规定：“【法条_53】”

【核心任务二：核对其他法条】
如果原文中引用了除上述5个法条以外的其他《公司法》法条，请严格核对是否与前置分析报告中双重比对的结果一致。如果不一致，请修正为正确的官方原文。

【核心任务三：时间背景修正】
当前是**2026年**，2024年修订的《公司法》已生效多年。请检查并删除文中所有“新修订的”、“即将施行的”、“新《公司法》”等过时字眼，统一改为《中华人民共和国公司法》。

【输出要求】：
请直接输出修改后的完整律师函正文，不要输出任何解释说明或校对过程。

【待处理的律师函】：
${response.text}` }
        ];

        const proofreadResponse = await ai.models.generateContent({
          model: 'gemini-3.1-pro-preview',
          contents: { parts: proofreadParts },
          config: {
            temperature: 0.0,
            tools: [{ googleSearch: {} }]
          }
        });

        // Pass 3: Final Official Source Verification
        const finalVerifyParts = [
          { text: `请对以下律师函进行最后一次审查。
【审查任务】：
1. 确保文中至少有一次明确说明了《公司法》的官方来源：“根据由第十四届全国人民代表大会常务委员会第七次会议于2023年12月29日修订，自2024年7月1日起施行的《中华人民共和国公司法》”。如果没有，请在第一次引用《公司法》的地方加上。
2. 确保文中引用的任何《公司法》具体条文内容，都经过了严格的正确性核验。对于核心法条，确保使用的是占位符；对于其他法条，确保与双重比对的结果一致。
3. 确保文中没有“新修订”、“新《公司法》”等过时字眼，因为现在是2026年，直接称呼《中华人民共和国公司法》。

【输出要求】：
请直接输出审查后的完整律师函正文，不要输出任何解释说明。

【待审查的律师函】：
${proofreadResponse.text || response.text}` }
        ];

        const finalVerifyResponse = await ai.models.generateContent({
          model: 'gemini-3.1-pro-preview',
          contents: { parts: finalVerifyParts },
          config: {
            temperature: 0.0,
            tools: [{ googleSearch: {} }]
          }
        });

        let finalLetter = finalVerifyResponse.text || proofreadResponse.text || response.text || '';
        
        // Final Pass: Deterministic String Replacement
        Object.keys(LAW_DATABASE).forEach(key => {
          finalLetter = finalLetter.replace(new RegExp(key, 'g'), LAW_DATABASE[key]);
        });
        
        // Fallback: Aggressive Regex Replacement for any hallucinated text if placeholders were missed
        const aggressiveReplace = (text: string, articleNames: string[], correctText: string) => {
          let newText = text;
          articleNames.forEach(name => {
            // Matches: 《公司法》第五十三条规定：“[any text]” or similar variations
            const regex = new RegExp(`(《[^》]*公司法[^》]*》.*?${name}.*?规定[：,，]*[“”"']*)([^”"'\n]+)([”"']*)`, 'g');
            newText = newText.replace(regex, `$1${correctText}$3`);
          });
          return newText;
        };

        finalLetter = aggressiveReplace(finalLetter, ['第二十三条', '第23条'], LAW_DATABASE['【法条_23】']);
        finalLetter = aggressiveReplace(finalLetter, ['第五十三条', '第53条'], LAW_DATABASE['【法条_53】']);
        finalLetter = aggressiveReplace(finalLetter, ['第八十八条', '第88条'], LAW_DATABASE['【法条_88】']);
        finalLetter = aggressiveReplace(finalLetter, ['第二百五十二条', '第252条'], LAW_DATABASE['【法条_252】']);
        finalLetter = aggressiveReplace(finalLetter, ['第二百五十三条', '第253条'], LAW_DATABASE['【法条_253】']);

        setGeneratedLetter(finalLetter);
      } else {
        setError('生成失败，未返回内容。');
      }
    } catch (err: any) {
      console.error(err);
      const errorMessage = err.message || '';
      if (errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
        setError('API 额度已用尽 (429 Quota Exceeded)。请稍后再试，或检查您的 Gemini API 计费状态。');
      } else {
        setError(`生成过程中发生错误: ${errorMessage || '未知错误'}`);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!generatedLetter) return;
    downloadAsWord(generatedLetter, '四川环信律师事务所_律师函.docx');
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* Header */}
      <header className="bg-slate-900 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex items-center gap-4">
          <Scale className="w-8 h-8 text-amber-500" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">四川环信律师事务所</h1>
            <p className="text-sm text-slate-400 mt-1">智能律师函生成系统</p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Inputs */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Section 1: Template Management */}
            <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                <FileText className="w-5 h-5 text-slate-500" />
                1. 律师函模板管理 (可选)
              </h2>
              
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-4">
                <h3 className="text-sm font-medium mb-3 text-slate-700">添加新模板</h3>
                <div className="flex flex-col gap-3">
                  <input 
                    type="file" 
                    onChange={e => setNewTemplateFile(e.target.files?.[0] || null)} 
                    className="text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100" 
                    accept=".pdf,.docx,.xlsx,.xls,.jpg,.jpeg,.png" 
                  />
                  <input 
                    type="text" 
                    value={newTemplateTags} 
                    onChange={e => setNewTemplateTags(e.target.value)} 
                    placeholder="添加标签 (逗号分隔，如: 合同纠纷, 催款)" 
                    className="text-sm p-2 border border-slate-300 rounded focus:ring-2 focus:ring-amber-500 outline-none" 
                  />
                  <button 
                    onClick={handleAddTemplate} 
                    disabled={!newTemplateFile} 
                    className="bg-slate-800 text-white text-sm py-2 rounded hover:bg-slate-700 disabled:opacity-50 transition-colors"
                  >
                    上传并保存模板
                  </button>
                </div>
              </div>
              
              {templates.length > 0 && (
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-sm font-medium text-slate-700">选择模板</h3>
                    <button 
                      onClick={() => setSelectedTemplateId(null)}
                      className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                        selectedTemplateId === null 
                          ? 'bg-amber-100 text-amber-700 font-medium border border-amber-200' 
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
                      }`}
                    >
                      不使用任何模板
                    </button>
                  </div>
                  <div className="relative mb-3">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                    <input 
                      type="text" 
                      value={templateSearch} 
                      onChange={e => setTemplateSearch(e.target.value)} 
                      placeholder="搜索模板名称或标签..." 
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none" 
                    />
                  </div>
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                    {filteredTemplates.map(t => (
                      <div 
                        key={t.id} 
                        onClick={() => setSelectedTemplateId(t.id)} 
                        className={`p-3 border rounded-lg cursor-pointer transition-colors ${selectedTemplateId === t.id ? 'border-amber-500 bg-amber-50' : 'hover:bg-slate-50 border-slate-200'}`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2 overflow-hidden">
                            <div className={`shrink-0 w-4 h-4 rounded-full border flex items-center justify-center ${selectedTemplateId === t.id ? 'border-amber-500 bg-amber-500' : 'border-slate-300'}`}>
                              {selectedTemplateId === t.id && <div className="w-2 h-2 bg-white rounded-full" />}
                            </div>
                            <span className="font-medium text-sm truncate">{t.name}</span>
                          </div>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(t.id); }} 
                            className="text-red-500 hover:bg-red-50 p-1 rounded shrink-0"
                            title="删除模板"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1 pl-6">
                          {t.tags.map((tag, i) => (
                            <span key={i} className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <Tag className="w-3 h-3" /> {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* Section 2: Case Details & Extraction */}
            <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                <FileUp className="w-5 h-5 text-slate-500" />
                2. 案情信息提取 (必填)
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">案情描述 (手动输入)</label>
                  <textarea
                    value={caseText}
                    onChange={(e) => setCaseText(e.target.value)}
                    placeholder="请详细描述案情，包括原执行案件及终本情况、涉嫌抽逃/虚假出资/财产混同的股东信息及相关线索、诉求等..."
                    className="w-full h-32 p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none resize-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">相关文件 (上传)</label>
                  <div className="relative border-2 border-dashed border-slate-300 rounded-lg p-6 hover:bg-slate-50 transition-colors text-center">
                    <input
                      type="file"
                      accept=".pdf,.docx,.xlsx,.xls,.jpg,.jpeg,.png,.txt"
                      onChange={(e) => setCaseFile(e.target.files?.[0] || null)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Upload className="w-8 h-8 text-slate-400" />
                      <span className="text-sm font-medium text-slate-700">
                        {caseFile ? caseFile.name : '点击或拖拽案情文件上传'}
                      </span>
                      <span className="text-xs text-slate-500">支持 PDF, Word, Excel, 图片, TXT</span>
                    </div>
                  </div>
                  {caseFile && (
                    <div className="mt-2 flex justify-end">
                      <button onClick={() => setCaseFile(null)} className="text-xs text-red-500 hover:text-red-700">清除已上传文件</button>
                    </div>
                  )}
                </div>
              </div>

              <button 
                onClick={handleExtract} 
                disabled={isExtracting || (!caseFile && !caseText.trim())} 
                className="w-full mt-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
              >
                {isExtracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {isExtracting ? 'AI 正在提取案情要素...' : '一键提取案情要素'}
              </button>

              {/* Extracted Elements Editable Form */}
              {caseElements && (
                <div className="mt-6 space-y-4 border-t border-slate-200 pt-6">
                  <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                    <Edit3 className="w-4 h-4 text-amber-500" />
                    确认并修改案情要素
                  </h3>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">当事人信息</label>
                    <textarea value={caseElements.parties} onChange={e => setCaseElements({...caseElements, parties: e.target.value})} className="w-full p-2 text-sm border border-slate-300 rounded-md h-16 focus:ring-1 focus:ring-amber-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">涉案股东详细信息</label>
                    <textarea value={caseElements.shareholders} onChange={e => setCaseElements({...caseElements, shareholders: e.target.value})} className="w-full p-2 text-sm border border-slate-300 rounded-md h-24 focus:ring-1 focus:ring-amber-500 outline-none" placeholder="请核对提取出的股东姓名、出资/增资金额等信息..." />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">争议焦点</label>
                    <textarea value={caseElements.focus} onChange={e => setCaseElements({...caseElements, focus: e.target.value})} className="w-full p-2 text-sm border border-slate-300 rounded-md h-16 focus:ring-1 focus:ring-amber-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">主要事实</label>
                    <textarea value={caseElements.facts} onChange={e => setCaseElements({...caseElements, facts: e.target.value})} className="w-full p-2 text-sm border border-slate-300 rounded-md h-24 focus:ring-1 focus:ring-amber-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">证据要点</label>
                    <textarea value={caseElements.evidence} onChange={e => setCaseElements({...caseElements, evidence: e.target.value})} className="w-full p-2 text-sm border border-slate-300 rounded-md h-16 focus:ring-1 focus:ring-amber-500 outline-none" />
                  </div>
                </div>
              )}
            </section>

            {/* Section 3: Special Requirements */}
            <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                <TypeIcon className="w-5 h-5 text-slate-500" />
                3. 特殊要求 (可选)
              </h2>
              <textarea
                value={specialRequirements}
                onChange={(e) => setSpecialRequirements(e.target.value)}
                placeholder="例如：语气要极其严厉、要求对方3日内回复、重点强调某条特定公司法法条等..."
                className="w-full h-24 p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none resize-none text-sm"
              />
            </section>

            {error && (
              <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm border border-red-200">
                {error}
              </div>
            )}

            <button
              onClick={handleGenerate}
              disabled={isGenerating || !caseElements}
              className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-medium text-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-70 disabled:cursor-not-allowed shadow-md"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin" />
                  正在起草律师函...
                </>
              ) : (
                <>
                  <Scale className="w-6 h-6" />
                  一键生成律师函
                </>
              )}
            </button>
          </div>

          {/* Right Column: Output */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            {legalAnalysis && (
              <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden shrink-0">
                <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                    <Scale className="w-5 h-5 text-blue-600" />
                    法律适用与正确性分析报告
                  </h2>
                </div>
                <div className="p-6 prose prose-slate max-w-none bg-blue-50/30 text-sm">
                  <ReactMarkdown>{legalAnalysis}</ReactMarkdown>
                </div>
              </section>
            )}

            <section className="bg-white rounded-xl shadow-sm border border-slate-200 flex-1 flex flex-col overflow-hidden">
              <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-800">生成结果预览</h2>
                <button
                  onClick={handleDownload}
                  disabled={!generatedLetter}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download className="w-4 h-4" />
                  下载为 Word
                </button>
              </div>
              
              <div className="flex-1 p-8 overflow-y-auto bg-slate-100/50">
                {generatedLetter ? (
                  <div className="bg-white p-10 rounded shadow-sm max-w-3xl mx-auto min-h-[800px] border border-slate-200 relative">
                    {/* Simulated Letterhead for Preview */}
                    <div className="text-center mb-8 border-b-2 border-red-700 pb-4">
                      <h1 className="text-3xl font-serif font-bold text-red-700 tracking-widest mb-4">四川环信律师事务所</h1>
                      <h2 className="text-2xl font-serif font-bold tracking-[0.5em]">律 师 函</h2>
                    </div>
                    
                    <div className="prose prose-slate max-w-none prose-headings:font-serif prose-p:leading-relaxed prose-p:text-justify prose-p:indent-8">
                      <ReactMarkdown>{generatedLetter}</ReactMarkdown>
                    </div>

                    {/* Simulated Footer for Preview */}
                    <div className="mt-16 pt-4 border-t border-slate-300 text-sm text-slate-600">
                      <p className="font-bold mb-1">联系方式：</p>
                      <p>地址：四川省成都市高新区环信大厦18层 | 电话：028-88888888 | 邮箱：legal@huanxinlaw.com</p>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400">
                    <FileText className="w-16 h-16 mb-4 opacity-20" />
                    <p>1. 提取案情要素</p>
                    <p>2. 点击生成律师函</p>
                    <p>3. 在此预览并下载</p>
                  </div>
                )}
              </div>
            </section>
          </div>

        </div>
      </main>
    </div>
  );
}
