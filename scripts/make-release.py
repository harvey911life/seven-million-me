# 出街檔：由 dist/index.html 生成兩個版本
#   release/public/index.html  公開版（加分享預覽 meta，俾 Netlify）
#   release/friends/index.html 朋友試玩版（加 noindex，唔俾搜尋器收錄）
import os

src = open('dist/index.html', encoding='utf-8').read()
assert '<meta charset="utf-8">' in src, 'dist/index.html 格式唔啱，先跑 npm run build'

META = '''<meta name="description" content="香港人Soci Game：由出世玩到終老，睇吓你一生嘅選擇會點樣影響健康、快樂同財務。內容為模擬，不構成投資建議。">
<meta property="og:title" content="七百萬分之我｜香港人Soci Game">
<meta property="og:description" content="由出世玩到終老，你嘅一生會點過？內容為模擬，不構成投資建議。">
<meta property="og:type" content="website">
'''

def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, 'w', encoding='utf-8').write(text)
    print(path, len(text.encode('utf-8')) // 1024, 'KB')

write('release/public/index.html', src.replace('<head>\n', '<head>\n' + META, 1))
write('release/friends/index.html', src.replace('<head>\n', '<head>\n<meta name="robots" content="noindex">\n', 1))
