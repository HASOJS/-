import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

export async function processFile(file: File): Promise<any> {
  const mimeType = file.type;
  const name = file.name.toLowerCase();

  if (mimeType === 'application/pdf' || mimeType.startsWith('image/')) {
    const base64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.readAsDataURL(file);
    });
    return {
      inlineData: {
        data: base64,
        mimeType: mimeType
      }
    };
  } else if (name.endsWith('.docx')) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return { text: `[Word文档内容: ${file.name}]\n${result.value}` };
  } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    let text = `[Excel文档内容: ${file.name}]\n`;
    workbook.SheetNames.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName];
      text += `表名: ${sheetName}\n`;
      text += XLSX.utils.sheet_to_csv(sheet) + '\n';
    });
    return { text };
  } else if (name.endsWith('.txt')) {
    const text = await file.text();
    return { text: `[文本文件内容: ${file.name}]\n${text}` };
  } else {
    throw new Error(`不支持的文件类型: ${file.name}。请上传 PDF、Word(.docx)、Excel 或图片。`);
  }
}
