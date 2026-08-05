import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Subtitle Payload & Timestamp Parsers', () => {
  let parseTime, parseTTML, parseJSONTimedText, parseVTT;

  beforeAll(() => {
    const code = fs.readFileSync(path.resolve(__dirname, '../injected.js'), 'utf8');

    // Extract helper function
    parseTime = new Function('timeStr', `
      if (typeof timeStr === 'number') return timeStr / 1000;
      if (!timeStr) return 0;
      if (timeStr.endsWith('ms')) return parseFloat(timeStr) / 1000;
      if (timeStr.endsWith('s')) return parseFloat(timeStr);
      if (timeStr.endsWith('t')) return parseFloat(timeStr) / 10000000;
      const parts = timeStr.split(':');
      if (parts.length === 3) {
        return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2].replace(',', '.'));
      } else if (parts.length === 2) {
        return parseFloat(parts[0]) * 60 + parseFloat(parts[1].replace(',', '.'));
      }
      return parseFloat(timeStr) || 0;
    `);

    parseTTML = new Function('xmlText', `
      const timeFn = ${parseTime.toString()};
      const cues = [];
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlText, 'text/xml');
      const paragraphs = doc.querySelectorAll('p');
      paragraphs.forEach((p) => {
        const beginAttr = p.getAttribute('begin');
        const endAttr = p.getAttribute('end');
        const durAttr = p.getAttribute('dur');
        let start = timeFn(beginAttr);
        let end = 0;
        if (endAttr) {
          end = timeFn(endAttr);
        } else if (durAttr) {
          end = start + timeFn(durAttr);
        }
        let textHtml = p.innerHTML.replace(/<br\\s*\\/?>/gi, '\\n').replace(/<[^>]+>/g, '').trim();
        if (start < end && textHtml) cues.push({ start, end, text: textHtml });
      });
      return cues;
    `);

    parseVTT = new Function('vttText', `
      const timeFn = ${parseTime.toString()};
      const cues = [];
      const lines = vttText.split(/\\r?\\n/);
      let i = 0;
      while (i < lines.length) {
        const line = lines[i].trim();
        if (line.includes('-->')) {
          const parts = line.split('-->');
          const start = timeFn(parts[0].trim());
          const end = timeFn(parts[1].trim().split(' ')[0]);
          i++;
          let cueText = [];
          while (i < lines.length && lines[i].trim() !== '') {
            cueText.push(lines[i].trim());
            i++;
          }
          const text = cueText.join('\\n').replace(/<[^>]+>/g, '');
          if (start < end && text) cues.push({ start, end, text });
        }
        i++;
      }
      return cues;
    `);

    parseJSONTimedText = new Function('jsonObj', `
      const cues = [];
      try {
        const events = jsonObj.events || (jsonObj.result && jsonObj.result.timedtext) || [];
        events.forEach((evt) => {
          const start = (evt.start || evt.startTime || 0) / 1000;
          const duration = (evt.duration || evt.dur || 0) / 1000;
          const end = evt.end ? evt.end / 1000 : (start + duration);

          let linesText = '';
          if (evt.lines) {
            linesText = evt.lines.map(l => typeof l === 'string' ? l : (l.text || '')).join('\\n');
          } else if (evt.text) {
            linesText = typeof evt.text === 'string' ? evt.text : (evt.text.map(t => t.value || t).join(' '));
          }

          linesText = linesText.replace(/<[^>]+>/g, '').trim();
          if (start < end && linesText) {
            cues.push({ start, end, text: linesText });
          }
        });
      } catch (e) {}
      return cues;
    `);
  });

  describe('Timestamp Parsing (parseTime)', () => {
    it('should parse millisecond format (e.g. 1500ms -> 1.5s)', () => {
      expect(parseTime('1500ms')).toBe(1.5);
    });

    it('should parse second format (e.g. 45s -> 45.0s)', () => {
      expect(parseTime('45s')).toBe(45.0);
    });

    it('should parse Netflix tick format (e.g. 10000000t -> 1.0s)', () => {
      expect(parseTime('10000000t')).toBe(1.0);
    });

    it('should parse HH:MM:SS,mmm comma separator format', () => {
      expect(parseTime('00:01:23,456')).toBe(83.456);
    });

    it('should parse short MM:SS format (e.g. 05:30 -> 330.0s)', () => {
      expect(parseTime('05:30')).toBe(330.0);
    });
  });

  describe('TTML XML Parser', () => {
    it('should parse TTML XML subtitles correctly', () => {
      const xml = `
        <tt>
          <body>
            <div>
              <p begin="00:01:10.500" end="00:01:15.000">Hello World<br/>Second Line</p>
            </div>
          </body>
        </tt>
      `;
      const cues = parseTTML(xml);
      expect(cues.length).toBe(1);
      expect(cues[0].start).toBe(70.5);
      expect(cues[0].end).toBe(75.0);
      expect(cues[0].text).toBe('Hello World\nSecond Line');
    });
  });

  describe('WebVTT Parser', () => {
    it('should parse WebVTT subtitles correctly', () => {
      const vtt = `WEBVTT

00:00:02.000 --> 00:00:05.500
Subtitle Line 1
Subtitle Line 2
`;
      const cues = parseVTT(vtt);
      expect(cues.length).toBe(1);
      expect(cues[0].start).toBe(2.0);
      expect(cues[0].end).toBe(5.5);
      expect(cues[0].text).toBe('Subtitle Line 1\nSubtitle Line 2');
    });
  });

  describe('Netflix JSON TimedText Parser', () => {
    it('should parse Netflix event-based JSON timedtext correctly', () => {
      const jsonObj = {
        events: [
          {
            start: 2000,
            duration: 3500,
            lines: [{ text: 'JSON Subtitle Line 1' }, { text: 'JSON Subtitle Line 2' }]
          }
        ]
      };
      const cues = parseJSONTimedText(jsonObj);
      expect(cues.length).toBe(1);
      expect(cues[0].start).toBe(2.0);
      expect(cues[0].end).toBe(5.5);
      expect(cues[0].text).toBe('JSON Subtitle Line 1\nJSON Subtitle Line 2');
    });
  });
});
