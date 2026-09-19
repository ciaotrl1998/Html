package cn.linecode.game2048;

import android.content.Context;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.TextView;

import java.util.List;

public class GameListAdapter extends ArrayAdapter<GameEntry> {
    public GameListAdapter(Context context, List<GameEntry> games) {
        super(context, 0, games);
    }

    @Override
    public View getView(int position, View convertView, ViewGroup parent) {
        if (convertView == null) {
            convertView = LayoutInflater.from(getContext()).inflate(R.layout.item_game, parent, false);
        }

        GameEntry game = getItem(position);
        TextView icon = convertView.findViewById(R.id.icon);
        TextView title = convertView.findViewById(R.id.title);
        TextView subtitle = convertView.findViewById(R.id.subtitle);

        if (game != null) {
            String label = game.title.trim();
            icon.setText(label.isEmpty() ? "H" : label.substring(0, 1).toUpperCase());
            title.setText(game.title);
            subtitle.setText(game.subtitle);
        }
        return convertView;
    }
}
