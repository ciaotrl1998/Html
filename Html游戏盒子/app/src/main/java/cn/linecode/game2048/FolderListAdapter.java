package cn.linecode.game2048;

import android.content.Context;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.TextView;

import java.io.File;
import java.util.List;

/** 目录浏览器列表:文件夹显示 “›”,html 显示 “HTML”,zip 显示 “ZIP”。 */
public class FolderListAdapter extends ArrayAdapter<File> {

    FolderListAdapter(Context context, List<File> files) {
        super(context, 0, files);
    }

    @Override
    public View getView(int position, View convertView, ViewGroup parent) {
        View view = convertView;
        if (view == null) {
            view = LayoutInflater.from(getContext())
                    .inflate(R.layout.item_folder, parent, false);
        }

        File item = getItem(position);
        TextView nameView = view.findViewById(R.id.folderName);
        TextView metaView = view.findViewById(R.id.folderMeta);
        if (item == null) {
            return view;
        }

        nameView.setText(item.getName());
        if (item.isDirectory()) {
            metaView.setText("›");
        } else if (ZipGames.isZip(item.getName())) {
            metaView.setText("ZIP");
        } else {
            metaView.setText("HTML");
        }
        return view;
    }
}
