import json, math, re, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
C=json.load(open('ngram_counts.json',encoding='utf-8'))
uni,bi=C['uni'],C['bi']
V=len(uni)+1; N=sum(uni.values())
def lp_bi(a,b):
    return math.log2((bi.get(a+b,0)+0.1)/(uni.get(a,0)+0.1*V))
def score(text):
    runs=re.findall(r'[\u0E01-\u0E5B]+',text)
    tot=0;n=0
    for r in runs:
        s='^'+r+'$'
        for i in range(1,len(s)):
            tot+=lp_bi(s[i-1],s[i]); n+=1
    return tot/n if n else None, n
T={
 'good270':'สั่งอาหารยังไงให้สมดล ? ผูเพิ่มผักหลากสีไพรร์รร เลือกโปรตีนไม่ติดม้ เลือกข้าวคล้อง / ไรช์เบจง์งี่ ลดน้าจิ้ม เมนเดิมปรบนดเดยขว กดขแเละ',
 'gt':'สั่งอาหารยังไงให้สมดุล ข้าวพอดี เพิ่มผักหลากสี เลือกโปรตีนไม่ติดมัน เมนูเดิม ปรับนิดเดียว ก็ดีขึ้นได้',
 'g90':'รอทกงน ๐ลงางทกรถกงาททา วฉอนต๑ดจะญิ หนุาจ๒ ตดูบเจล รูฐลกาลรฎ ลลดูน๑เลพลงูท ข่ชงกอหมูด คูรนหน๑๕๒',
 'g0':'งเลไวโช คว เณ',
 'g180':'วยคู ว',
 'med':'ยาพาราเซตามอล มิลลิกรัม รับประทานครั้งละ เม็ดทุก ชั่วโมง เมื่อมีอาการปวดหรือมีไข้',
 'lib':'ห้องสมุดเปิดบริการวันจันทร์ถึงวันศุกร์ เวลา น.',
 'defocus':'wie! พื้นเปียกสืน ครณาเดินด้วยคาวามขะมัตระวัง',
 'dimjunk':'๒ร5 ด ซบ แห42 รรรเรเรเรว',
}
for k,t in T.items():
    s,n=score(t); print(f'{k:8s} bits/char {s:6.2f} n={n}')

tri=C['tri']
def lp_tri(a,b,c):
    pb=(bi.get(b+c,0)+0.1)/(uni.get(b,0)+0.1*V)
    ctx=bi.get(a+b,0)
    lam=ctx/(ctx+5)
    pt=tri.get(a+b+c,0)/ctx if ctx else 0
    return math.log2(lam*pt+(1-lam)*pb)
def score3(text):
    tot=0;n=0
    for r in re.findall(r'[\u0E01-\u0E5B]+',text):
        s='^^'+r+'$'
        for i in range(2,len(s)):
            tot+=lp_tri(s[i-2],s[i-1],s[i]); n+=1
    return tot/n if n else None
print('--- trigram')
for k,t in T.items(): print(f'{k:8s} {score3(t):6.2f}')
# ขนาดถ้าเก็บ trigram ที่นับได้ >= k
for k in (3,5,10,20):
    print('tri>=',k, sum(1 for v in tri.values() if v>=k))
