import os,json,http.client
from urllib.parse import urlsplit
from re import compile
from functools import lru_cache

A=(1,-1,10,-10,9,-9,11,-11)
N=(21,-21,19,-19,12,-12,8,-8)
S=[21+10*r+f for r in range(8) for f in range(8)]
NAME={i:chr(97+i%10-1)+str(i//10-1) for i in S}
SQUARE={v:k for k,v in NAME.items()}
PIECE=' PNBRQK  pnbrqk'
V=(0,100,320,340,515,960,0)
W=(0,0,1,1,2,4,0)
MG=[[0]*120 for _ in range(15)]
EG=[[0]*120 for _ in range(15)]
for i in S:
    f=i%10-1
    for c in (0,8):
        r=i//10-2 if not c else 9-i//10
        x=min(f,7-f)
        y=min(r,7-r)
        center=x+y
        edge=(not x)+(not y)
        mid=(0,7*r+(10*x-17)*(r in (2,3,4))-11*(r==1 and x==3),13*center-21*edge,8*center-12*(r==0),4*x+17*(r==6),3*center-8*(r>1),-9*center-13*r+27*(r==0 and f in (1,2,6)))
        end=(0,4*r+r*r+2*x,9*center-14*edge,6*center,3*r,4*center,13*center-4*edge)
        for t in range(1,7):
            sign=1-c//4
            MG[c+t][i]=sign*(V[t]+mid[t])
            EG[c+t][i]=sign*(V[t]+end[t])
R=[15]*120
for i,v in ((21,13),(25,12),(28,14),(91,7),(95,3),(98,11)):
    R[i]=v
OWN=(compile(b'[\x01-\x06]'),compile(b'[\x09-\x0e]'))

def fen(text):
    layout,turn,castle,ep,half,*_=text.split()
    b=bytearray([16])*120
    for r,row in enumerate(reversed(layout.split('/'))):
        i=21+10*r
        for t in row:
            if t.isdigit():
                k=int(t)
                b[i:i+k]=bytes(k)
                i+=k
            else:
                b[i]=PIECE.index(t)
                i+=1
    rights=sum(1<<i for i,t in enumerate('KQkq') if t in castle)
    return (bytes(b),8*(turn=='b'),b.index(6),b.index(14),rights,SQUARE.get(ep,0),sum(MG[b[i]][i] for i in S),sum(EG[b[i]][i] for i in S),sum(W[b[i]&7] for i in S),int(half))

def attacked(b,i,c):
    p=10 if c else -10
    if b[i+p-1]==c+1 or b[i+p+1]==c+1:
        return True
    for d in N:
        if b[i+d]==c+2:
            return True
    for k,d in enumerate(A):
        j=i+d
        t=b[j]
        if t==c+6:
            return True
        while not t:
            j+=d
            t=b[j]
        if t==c+5 or t==c+4-(k>=4):
            return True
    return False

def check(p):
    b,c,k,l,*_=p
    return attacked(b,l if c else k,c^8)

def moves(p,tactical):
    b,c,k,l,rights,ep,*_=p
    enemy=c^8
    forward=10-c*5//2
    for match in OWN[c>>3].finditer(b):
        i=match.start()
        t=b[i]&7
        if t==1:
            j=i+forward
            promote=j<29 or j>90
            if not b[j]:
                if promote:
                    for q in (5,2,4,3):
                        yield i,j,q
                elif not tactical:
                    yield i,j,0
                    if i//10==(8 if c else 3) and not b[j+forward]:
                        yield i,j+forward,0
            for j in (j-1,j+1):
                if (b[j] and b[j]&24==enemy) or j==ep:
                    for q in ((5,2,4,3) if promote else (0,)):
                        yield i,j,q
        else:
            for d in (N if t==2 else A[4:] if t==3 else A[:4] if t==4 else A):
                j=i+d
                while not b[j]:
                    if not tactical:
                        yield i,j,0
                    if t in (2,6):
                        break
                    j+=d
                if b[j] and b[j]&24==enemy:
                    yield i,j,0
    if not tactical and rights&(12 if c else 3):
        i=l if c else k
        for d in (1,-1):
            mask=(1 if d==1 else 2)<<(2 if c else 0)
            if rights&mask and not (b[i+d] or b[i+2*d] or (d<0 and b[i-3])) and not (attacked(b,i,enemy) or attacked(b,i+d,enemy)):
                yield i,i+2*d,0

RAY=[bytes(int(i%10==j%10 or i//10==j//10 or abs(i%10-j%10)==abs(i//10-j//10)) for j in range(120)) for i in range(120)]

def play(p,m,safe=False):
    b,c,k,l,rights,ep,mg,eg,phase,half=p
    i,j,q=m
    t=b[i]
    u=q+c if q else t
    h=j+(10 if c else -10) if j==ep and t==c+1 else j
    v=b[h]
    a=bytearray(b)
    a[i]=a[h]=0
    a[j]=u
    mg+=MG[u][j]-MG[t][i]-MG[v][h]
    eg+=EG[u][j]-EG[t][i]-EG[v][h]
    if t==c+6:
        if c:
            l=j
        else:
            k=j
        if abs(j-i)==2:
            x,y=(i+3,i+1) if j>i else (i-4,i-1)
            rook=c+4
            a[x]=0
            a[y]=rook
            mg+=MG[rook][y]-MG[rook][x]
            eg+=EG[rook][y]-EG[rook][x]
    king=l if c else k
    if (not safe or t&7==6 or RAY[king][i] or h!=j) and attacked(a,king,c^8):
        return None
    pawn=t&7==1
    if pawn and abs(j-i)==20 and c^9 in (a[j-1],a[j+1]):
        ep=(i+j)//2
    else:
        ep=0
    return bytes(a),c^8,k,l,rights&R[i]&R[j],ep,mg,eg,phase+W[q]-W[v&7],0 if pawn or v else half+1

def key(p):
    b,c,_,_,rights,ep,*_=p
    if ep:
        i=ep+(10 if c else -10)
        if not any(b[j]==c+1 and play(p,(j,ep,0)) for j in (i-1,i+1)):
            ep=0
    return b,c,rights,ep

PAWN_MAP=bytes(i if i in (1,9) else 0 for i in range(256))

@lru_cache(8192)
def pawns(b):
    mid=end=0
    for t in (1,9):
        own=[i for i,v in enumerate(b) if v==t]
        files={i%10 for i in own}
        foe=[i for i,v in enumerate(b) if v==t^8]
        sign=1 if t==1 else -1
        mid-=sign*13*(len(own)-len(files))
        for i in own:
            f=i%10
            if f-1 not in files and f+1 not in files:
                mid-=sign*12
                end-=sign*9
            if not any(abs(j%10-f)<=1 and (j-i)*sign>0 for j in foe):
                r=i//10-2 if sign==1 else 9-i//10
                mid+=sign*(2*r+r*r)
                end+=sign*(2*r*r+3*r)
    return mid,end

def dead(b,phase):
    if not (b.count(1) or b.count(9)):
        return phase<=1 or not any(t in b for t in (2,4,5,10,12,13)) and len({(i//10+i%10)%2 for i in S if b[i]&7==3})<=1

def uci(m):
    i,j,q=m
    return NAME[i]+NAME[j]+' pnbrq'[q:q+bool(q)]

def decode(u):
    return SQUARE[u[:2]],SQUARE[u[2:4]],' pnbrq'.index(u[4]) if len(u)==5 else 0

M=30000
class Budget(Exception): pass

def choose(p,legal,past,ply,budget):
    root=sorted(map(decode,legal))
    table={}
    seen=past.copy()
    killer={}
    history={}
    nodes=budget
    def search(p,d,a,z,h,allow=True):
        nonlocal nodes
        nodes-=1
        if nodes<0:
            raise Budget
        b,c,k,l,r,e,mg,eg,phase,half=p
        ky=key(p)
        repeat=seen.get(ky,0) if allow else 0
        incheck=check(p)
        draw=repeat>=2 or half>=100 or phase<=4 and dead(b,phase)
        if h and allow and (draw or ply+h>=200):
            if not any(play(p,m,not incheck) for m in moves(p,False)):
                return h-M if incheck else 0
            if draw:
                return 0
            lead=sum((b.count(i)-b.count(i+8))*v for i,v in enumerate((0,1,3,3,5,9)) if i)*(1-c//4)
            return M-100 if lead>=5 else 100-M if lead<=-5 else 0
        if incheck and d>0 and h<12:
            d+=1
        q=d<=0 and not incheck
        pv=z-a>1
        ph=min(24,phase)
        pm,pe=pawns(b.translate(PAWN_MAP))
        pair=29*((b.count(3)>=2)-(b.count(11)>=2))
        stat=(((mg+pm)*ph+(eg+pe)*(24-ph))*(1-c//4))//24+pair*(1-c//4)+10
        tk=ky,half if half>=70 else 0
        td,ts,flag,tm=table.get(tk,(-100,0,0,None))
        if h and allow and not pv and not repeat and ply<160 and d>0 and td>=d and abs(ts)<M-200:
            if flag==0 or flag==1 and ts>=z or flag==-1 and ts<=a:
                return ts
        if h>=64:
            return stat
        if q and stat>=z:
            return stat
        if q:
            a=max(a,stat)
        if h and d>0 and not pv and not incheck and abs(z)<M-200:
            if d<=3 and stat>=z+95*d and phase>4:
                return stat
            if allow and d>=3 and stat>=z and half<90 and ply+h<185 and phase>3 and any(t+c in b for t in (2,3,4,5)):
                n=(b,c^8,k,l,r,0,mg,eg,phase,half)
                if -search(n,d-3-d//6,-z,1-z,h+1,False)>=z:
                    return z
        old=a
        best=stat if q else h-M
        bm=None
        count=0
        def rank(m):
            i,j,u=m
            if m==tm:
                return 100000
            t=b[i]&7
            v=b[j]&7 or (j==e and t==1)
            if v or u:
                return 10000+15*(V[v]+V[u])-V[t]
            if m==killer.get(h):
                return 9000
            return history.get((c,i,j),0)+(MG[b[i]][j]-MG[b[i]][i])*(1-c//4)
        candidates=sorted(root if not h else moves(p,q),key=rank,reverse=True)
        if allow:
            seen[ky]=repeat+1
        for m in candidates:
            i,j,u=m
            quiet=not(b[j] or u or j==e and b[i]&7==1)
            n=play(p,m,not incheck)
            if not n:
                continue
            count+=1
            if count==1 or d<=0:
                s=-search(n,d-1,-z,-a,h+1,allow)
            else:
                red=(1+(count>=10 and d>=5)) if d>=3 and count>=(5 if pv else 3) and quiet and not incheck and m!=killer.get(h) and not check(n) else 0
                s=-search(n,d-1-red,-a-1,-a,h+1,allow)
                if red and s>a:
                    s=-search(n,d-1,-a-1,-a,h+1,allow)
                if pv and a<s<z:
                    s=-search(n,d-1,-z,-a,h+1,allow)
            if s>best:
                best,bm=s,m
            if s>a:
                a=s
            if a>=z:
                if d>0 and quiet:
                    killer[h]=m
                    hk=c,i,j
                    history[hk]=min(8000,history.get(hk,0)+d*d)
                break
        if allow:
            if repeat:
                seen[ky]=repeat
            else:
                del seen[ky]
        if not count and not incheck and (not q or phase<=8 and not any(play(p,m,True) for m in moves(p,False))):
            best=0
        if allow and d>0 and (d>=td or not h):
            table[tk]=d,best,(1 if best>=z else -1 if best<=old else 0),bm or tm
        return best
    choice=root[0]
    if len(root)>1:
        try:
            for d in range(1,32):
                score=search(p,d,-M,M,0)
                choice=table[key(p),p[-1] if p[-1]>=70 else 0][3] or choice
                if score>=M-100:
                    break
        except Budget:
            pass
    return uci(choice)

def main():
    url=urlsplit(os.environ['MAKEFUN_ENV_URL'])
    conn=http.client.HTTPConnection(url.hostname,url.port)
    def post(route,data):
        conn.request('POST',route,json.dumps(data),{'content-type':'application/json'})
        res=conn.getresponse()
        return json.loads(res.read())
    while True:
        g=post('/game',{})
        if g['status']=='done':
            return
        hist={}
        pos=fen(g['start_fen'])
        i=0
        while g['status']=='your_move':
            for move in g['moves'][i:]:
                k=key(pos)
                hist[k]=hist.get(k,0)+1
                pos=play(pos,decode(move))
            i=len(g['moves'])
            m=choose(pos,g['legal_moves'],hist,i,72000)
            g=post('/move',{'game':g['game'],'move':m})

if __name__=='__main__':
    main()
