# 將題庫 JSON 壓縮成遊戲用格式：[id, 科目序號, 難度 0/1/2, age_min, bank 0 測驗 / 1 公開試, 題目, A, B, C, D, 答案序號, 解釋]
import json, sys, os
src = sys.argv[1]
out = sys.argv[2]
SUBJ = ['中文', '英文', '數學', '公民與社會發展', '物理', '化學', '生物', '經濟']
DIFF = {'易': 0, '中': 1, '難': 2}
rows = []
for f in sorted(os.listdir(src)):
    if not f.endswith('.json'): continue
    for q in json.load(open(os.path.join(src, f), encoding='utf-8')):
        rows.append([q['id'], SUBJ.index(q['subject']), DIFF[q['difficulty']], q['age_min'], 1 if q['bank'] == '公開試' else 0,
                     q['question'], q['A'], q['B'], q['C'], q['D'], 'ABCD'.index(q['answer']), q.get('explanation', '')])
json.dump(rows, open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(len(rows), 'questions')
