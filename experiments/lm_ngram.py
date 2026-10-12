# สร้างตารางนับ n-gram ตัวอักษรไทย: ต้องมี tnc_freq.txt (จาก wheel ของ pythainlp 5.1.2: pythainlp/corpus/tnc_freq.txt)
import math, random, re, collections, json, sys
words=[]
for line in open('tnc_freq.txt',encoding='utf-8'):
    p=line.rstrip('\n').split('\t')
    if len(p)<2: continue
    w,f=p[0],int(p[1])
    if re.fullmatch(r'[\u0E01-\u0E5B]+',w): words.append((w,f))
print('words',len(words))
random.seed(1)
W=[w for w,_ in words]; F=[f for _,f in words]
# สร้างข้อความจำลองต่อกันแบบไม่มีช่องว่าง (เหมือนบรรทัดภาษาไทยจริง) ตามความถี่คำ
corpus=[]
for _ in range(60000):
    n=random.randint(3,9)
    corpus.append('^'+''.join(random.choices(W,F,k=n))+'$')
uni=collections.Counter(); bi=collections.Counter(); tri=collections.Counter()
for s in corpus:
    for i,c in enumerate(s):
        uni[c]+=1
        if i>=1: bi[s[i-1:i+1]]+=1
        if i>=2: tri[s[i-2:i+1]]+=1
print('chars',sum(uni.values()),'uni',len(uni),'bi',len(bi),'tri',len(tri))
json.dump({'uni':uni,'bi':bi,'tri':tri},open('ngram_counts.json','w',encoding='utf-8'),ensure_ascii=False)
