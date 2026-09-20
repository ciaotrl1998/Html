package cn.linecode.game2048;

import android.animation.ValueAnimator;
import android.content.Context;
import android.util.AttributeSet;
import android.view.MotionEvent;
import android.view.animation.OvershootInterpolator;
import android.widget.GridView;

/**
 * 支持 iOS 风格弹性过度滚动(越界阻尼拖动 + 松手回弹)的 GridView。
 *
 * <p>实现方式:正常滚动交给父类;当已在顶部/底部仍继续拖动时,改为平移自身(translationY)
 * 并施加阻尼,产生"橡皮筋"效果;松手后用带轻微过冲的插值器弹回原位。
 * 越界内容由外层 FrameLayout 裁剪,配合顶部渐变底板实现"淡出到标题下方"的过渡,避免遮挡标题。
 */
public class BounceGridView extends GridView {

    /** 越界拖动阻尼系数:越小越"重",0.5 为中等手感。 */
    private static final float DRAG_FACTOR = 0.5f;
    /** 回弹动画时长(毫秒)。 */
    private static final long SPRING_BACK_DURATION_MS = 300L;

    private float lastTouchY;
    private boolean overscrolling;
    private ValueAnimator springBackAnimator;

    public BounceGridView(Context context) {
        super(context);
    }

    public BounceGridView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    public BounceGridView(Context context, AttributeSet attrs, int defStyleAttr) {
        super(context, attrs, defStyleAttr);
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                lastTouchY = event.getY();
                cancelSpringBack();
                // 若上一次回弹尚未结束,则接着该位移继续拖动,避免位置跳变。
                overscrolling = getTranslationY() != 0f;
                break;
            case MotionEvent.ACTION_MOVE: {
                float y = event.getY();
                float dy = y - lastTouchY;
                lastTouchY = y;
                if (overscrolling) {
                    setTranslationY(getTranslationY() + dy * DRAG_FACTOR);
                    return true;
                }
                if (dy > 0 && !canScrollVertically(-1)) {
                    // 已在顶部仍向下拖 -> 进入顶部越界
                    overscrolling = true;
                    cancelLongPress();
                    setTranslationY(dy * DRAG_FACTOR);
                    return true;
                }
                if (dy < 0 && !canScrollVertically(1)) {
                    // 已在底部仍向上拖 -> 进入底部越界
                    overscrolling = true;
                    cancelLongPress();
                    setTranslationY(dy * DRAG_FACTOR);
                    return true;
                }
                break;
            }
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                if (overscrolling) {
                    overscrolling = false;
                    startSpringBack();
                    // 事件已不再交给父类,主动补发 CANCEL 清除按下的选中态,避免高亮残留。
                    cancelSuperTouch(event);
                    return true;
                }
                break;
            default:
                break;
        }
        return super.onTouchEvent(event);
    }

    /** 松手后带轻微过冲地弹回原位,形成弹性回弹。 */
    private void startSpringBack() {
        cancelSpringBack();
        springBackAnimator = ValueAnimator.ofFloat(getTranslationY(), 0f);
        springBackAnimator.setDuration(SPRING_BACK_DURATION_MS);
        springBackAnimator.setInterpolator(new OvershootInterpolator(1.0f));
        springBackAnimator.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() {
            @Override
            public void onAnimationUpdate(ValueAnimator animation) {
                setTranslationY((float) animation.getAnimatedValue());
            }
        });
        springBackAnimator.start();
    }

    private void cancelSpringBack() {
        if (springBackAnimator != null) {
            springBackAnimator.cancel();
            springBackAnimator = null;
        }
    }

    /** 向父类补发一次 CANCEL,仅用于复位触摸状态。 */
    private void cancelSuperTouch(MotionEvent event) {
        MotionEvent cancel = MotionEvent.obtain(event);
        cancel.setAction(MotionEvent.ACTION_CANCEL);
        super.onTouchEvent(cancel);
        cancel.recycle();
    }

    @Override
    protected void onDetachedFromWindow() {
        cancelSpringBack();
        super.onDetachedFromWindow();
    }
}
