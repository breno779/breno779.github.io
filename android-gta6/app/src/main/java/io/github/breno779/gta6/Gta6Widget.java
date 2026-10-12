package io.github.breno779.gta6;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

import java.util.Calendar;

/**
 * Widget da tela inicial: mostra quantos DIAS faltam para o lançamento do GTA VI
 * (19/11/2026), sem abrir nada. Os dias só mudam à meia-noite, então atualizamos
 * ~1x por dia via AlarmManager (poupa bateria). Tocar abre o contador completo.
 */
public class Gta6Widget extends AppWidgetProvider {

    private static final String ACTION_TICK = "io.github.breno779.gta6.GTA6_TICK";
    private static final long DAY_MS = 24L * 60 * 60 * 1000;

    // Data-alvo: 19 de novembro de 2026 (PS5 / Xbox Series X|S)
    private static final int T_YEAR = 2026;
    private static final int T_MONTH = Calendar.NOVEMBER; // novembro (índice 10)
    private static final int T_DAY = 19;

    private static final String[] MESES = {
        "JAN", "FEV", "MAR", "ABR", "MAI", "JUN",
        "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"
    };

    @Override
    public void onUpdate(Context context, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) {
            updateWidget(context, mgr, id);
        }
        scheduleNextMidnight(context);
    }

    @Override
    public void onEnabled(Context context) {
        scheduleNextMidnight(context);
    }

    @Override
    public void onDisabled(Context context) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(tickIntent(context));
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        String action = intent == null ? null : intent.getAction();
        if (ACTION_TICK.equals(action) || Intent.ACTION_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_TIME_CHANGED.equals(action)
                || Intent.ACTION_TIMEZONE_CHANGED.equals(action)
                || Intent.ACTION_DATE_CHANGED.equals(action)) {
            updateAll(context);
            scheduleNextMidnight(context);
        }
    }

    private static void updateAll(Context context) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        ComponentName cn = new ComponentName(context, Gta6Widget.class);
        int[] ids = mgr.getAppWidgetIds(cn);
        for (int id : ids) {
            updateWidget(context, mgr, id);
        }
    }

    private static void updateWidget(Context context, AppWidgetManager mgr, int id) {
        long days = daysLeft();
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_gta6);

        if (days > 1) {
            v.setTextViewText(R.id.w_days, String.valueOf(days));
            v.setTextViewText(R.id.w_label, "DIAS PARA O LANÇAMENTO");
        } else if (days == 1) {
            v.setTextViewText(R.id.w_days, "1");
            v.setTextViewText(R.id.w_label, "DIA PARA O LANÇAMENTO");
        } else if (days == 0) {
            v.setTextViewText(R.id.w_days, "HOJE");
            v.setTextViewText(R.id.w_label, "É O DIA DO GTA VI!");
        } else {
            v.setTextViewText(R.id.w_days, "GTA VI");
            v.setTextViewText(R.id.w_label, "JÁ DISPONÍVEL 🎉");
        }

        v.setTextViewText(R.id.w_date, T_DAY + " " + MESES[T_MONTH] + " " + T_YEAR);

        // Tocar no widget abre o app (contador completo).
        Intent open = new Intent(context, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(
            context, 0, open,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        v.setOnClickPendingIntent(R.id.widget_root, pi);

        mgr.updateAppWidget(id, v);
    }

    /** Dias inteiros (arredondados) entre hoje e a data-alvo, no fuso local. */
    private static long daysLeft() {
        Calendar today = Calendar.getInstance();
        today.set(Calendar.HOUR_OF_DAY, 0);
        today.set(Calendar.MINUTE, 0);
        today.set(Calendar.SECOND, 0);
        today.set(Calendar.MILLISECOND, 0);

        Calendar target = Calendar.getInstance();
        target.clear();
        target.set(T_YEAR, T_MONTH, T_DAY, 0, 0, 0);

        long diff = target.getTimeInMillis() - today.getTimeInMillis();
        return (long) Math.floor((diff + DAY_MS / 2.0) / DAY_MS);
    }

    private static PendingIntent tickIntent(Context context) {
        Intent i = new Intent(context, Gta6Widget.class);
        i.setAction(ACTION_TICK);
        return PendingIntent.getBroadcast(
            context, 1, i,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static void scheduleNextMidnight(Context context) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;

        Calendar next = Calendar.getInstance();
        next.add(Calendar.DAY_OF_YEAR, 1);
        next.set(Calendar.HOUR_OF_DAY, 0);
        next.set(Calendar.MINUTE, 1);
        next.set(Calendar.SECOND, 0);
        next.set(Calendar.MILLISECOND, 0);

        am.setInexactRepeating(AlarmManager.RTC, next.getTimeInMillis(),
            AlarmManager.INTERVAL_DAY, tickIntent(context));
    }
}
