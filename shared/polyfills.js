// roundRect polyfill for older Safari
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x,y,w,h,r) {
    if (typeof r === 'number') r = [r,r,r,r];
    var tl=r[0]||0,tr=r[1]||0,br=r[2]||0,bl=r[3]||0;
    this.moveTo(x+tl,y); this.lineTo(x+w-tr,y); this.quadraticCurveTo(x+w,y,x+w,y+tr);
    this.lineTo(x+w,y+h-br); this.quadraticCurveTo(x+w,y+h,x+w-br,y+h);
    this.lineTo(x+bl,y+h); this.quadraticCurveTo(x,y+h,x,y+h-bl);
    this.lineTo(x,y+tl); this.quadraticCurveTo(x,y,x+tl,y); this.closePath();
  };
}
