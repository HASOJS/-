import { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle } from 'docx';
import { saveAs } from 'file-saver';

export const downloadAsWord = async (text: string, filename: string) => {
  const paragraphs: Paragraph[] = [];

  // 抬头：四川环信律师事务所
  paragraphs.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({
        text: "四川环信律师事务所",
        size: 44, // 小初
        font: "SimSun",
        bold: true,
        color: "CC0000"
      })
    ],
    spacing: { after: 200 }
  }));

  // 副标题：律师函
  paragraphs.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({
        text: "律 师 函",
        size: 36, // 二号
        font: "SimSun",
        bold: true
      })
    ],
    spacing: { after: 400 },
    border: {
      bottom: { color: "CC0000", space: 10, style: BorderStyle.SINGLE, size: 12 }
    }
  }));

  // 正文处理
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      paragraphs.push(new Paragraph({ spacing: { after: 200 } }));
      continue;
    }

    let alignment: any = AlignmentType.LEFT;
    let indent = { firstLine: 560 }; // 首行缩进2字符
    let isTitle = false;

    // 启发式判断落款和日期（右对齐）
    if ((trimmedLine.includes('律师事务所') || trimmedLine.includes('律师')) && trimmedLine.length < 20 && lines.indexOf(line) > lines.length - 5) {
        alignment = AlignmentType.RIGHT;
        indent = { firstLine: 0 };
    } else if (trimmedLine.match(/^[0-9]{4}年[0-9]{1,2}月[0-9]{1,2}日/) && lines.indexOf(line) > lines.length - 5) {
        alignment = AlignmentType.RIGHT;
        indent = { firstLine: 0 };
    } else if (trimmedLine.startsWith('#')) {
        alignment = AlignmentType.CENTER;
        indent = { firstLine: 0 };
        isTitle = true;
    } else if (trimmedLine.endsWith(':') || trimmedLine.endsWith('：')) {
        // 称呼通常不缩进
        if (lines.indexOf(line) < 5) {
            indent = { firstLine: 0 };
        }
    }

    // 简单处理 Markdown 加粗
    const parts = trimmedLine.split('**');
    const textRuns = parts.map((part, index) => {
      // 移除 # 号
      const cleanPart = part.replace(/#/g, '').trim();
      return new TextRun({
        text: cleanPart,
        bold: index % 2 === 1 || trimmedLine.startsWith('#'),
        size: isTitle ? 32 : 28, // 四号
        font: "SimSun"
      });
    });

    paragraphs.push(new Paragraph({
      alignment,
      indent,
      children: textRuns,
      spacing: { after: 200, line: 360 } // 1.5倍行距
    }));
  }

  // 页脚联系方式
  paragraphs.push(new Paragraph({
    border: { top: { color: "000000", space: 10, style: BorderStyle.SINGLE, size: 6 } },
    spacing: { before: 800, after: 100 },
    children: [
      new TextRun({ text: "联系方式：", size: 21, font: "SimSun", bold: true })
    ]
  }));
  paragraphs.push(new Paragraph({
    children: [
      new TextRun({ text: "地址：四川省成都市高新区环信大厦18层  |  电话：028-88888888  |  邮箱：legal@huanxinlaw.com", size: 21, font: "SimSun" })
    ]
  }));

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
        }
      },
      children: paragraphs
    }]
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, filename);
};
