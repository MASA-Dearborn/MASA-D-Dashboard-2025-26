import matplotlib.pyplot as plt
import pandas as pd
from mpl_toolkits.mplot3d import Axes3D


def read_csv_robust(filepath):
    try:
        df = pd.read_csv(filepath, header=None, encoding='utf-8')
    except UnicodeDecodeError:
        df = pd.read_csv(filepath, header=None, encoding='latin-1')
    except Exception as e:
        print(f"Error reading CSV with pandas: {e}")
        print("Attempting manual read...")

        data = []
        max_columns = 0

        with open(filepath, 'r', encoding='latin-1', errors='ignore') as file:
            for line_num, line in enumerate(file, 1):
                try:
                    line = line.strip()
                    if line:
                        row = line.split(',')
                        row = [field.strip('"\' ') for field in row]
                        data.append(row)
                        max_columns = max(max_columns, len(row))
                except Exception as e:
                    print(f"Warning: Skipping line {line_num} due to error: {e}")
                    continue

        for i, row in enumerate(data):
            if len(row) < max_columns:
                data[i] = row + [''] * (max_columns - len(row))
            elif len(row) > max_columns:
                data[i] = row[:max_columns]

        if len(data) > 0:
            df = pd.DataFrame(data)
        else:
            raise ValueError("Not enough data in CSV file")

    return df


def plot_rocket_trajectory(filepath):
    print(f"Reading data from: {filepath}")
    df = read_csv_robust(filepath)

    print(f"\nData shape: {df.shape}")
    print("\nFirst 5 rows:")
    print(df.head())

    num_cols = df.shape[1]
    print(f"\nNumber of columns: {num_cols}")

    if num_cols >= 8:
        col_names = ['time', 'altitude', 'x_position', 'y_position',
                     'latitude', 'longitude', 'data_6', 'data_7']
        df.columns = col_names[:num_cols]
    elif num_cols >= 3:
        col_names = ['col_' + str(i) for i in range(num_cols)]
        df.columns = col_names

    print("\nAssigned column names:", df.columns.tolist())

    for col in df.columns:
        df[col] = pd.to_numeric(df[col], errors='coerce')

    if num_cols >= 8:
        altitude = df['altitude']
        x_position = df['x_position']
        y_position = df['y_position']
    elif num_cols >= 4:
        col_maxes = df.abs().max()
        altitude_col = col_maxes.idxmax()
        remaining_cols = [c for c in df.columns if c != altitude_col]

        if len(remaining_cols) >= 2:
            x_position = df[remaining_cols[0]]
            y_position = df[remaining_cols[1]]
            altitude = df[altitude_col]
            print(f"\nAuto-detected columns:")
            print(f"  X: {remaining_cols[0]}")
            print(f"  Y: {remaining_cols[1]}")
            print(f"  Altitude: {altitude_col}")
        else:
            print("Error: Not enough columns for 3D plot")
            return
    else:
        print("Error: Need at least 3 columns for 3D plot")
        return

    plot_data = pd.DataFrame({
        'x': x_position,
        'y': y_position,
        'z': altitude
    }).dropna()

    if len(plot_data) == 0:
        print("Error: No valid numeric data found for plotting")
        return

    print(f"\nPlotting {len(plot_data)} data points")
    print(f"X range: [{plot_data['x'].min():.2f}, {plot_data['x'].max():.2f}]")
    print(f"Y range: [{plot_data['y'].min():.2f}, {plot_data['y'].max():.2f}]")
    print(f"Altitude range: [{plot_data['z'].min():.2f}, {plot_data['z'].max():.2f}]")

    fig = plt.figure(figsize=(12, 9))
    ax = fig.add_subplot(111, projection='3d')

    ax.plot(plot_data['x'], plot_data['y'], plot_data['z'],
            'b-', linewidth=2, alpha=0.6, label="Rocket Path")

    ax.scatter(plot_data['x'].iloc[0], plot_data['y'].iloc[0], plot_data['z'].iloc[0],
               c='green', s=150, marker='o', label="Start Position", edgecolors='black')
    ax.scatter(plot_data['x'].iloc[-1], plot_data['y'].iloc[-1], plot_data['z'].iloc[-1],
               c='red', s=150, marker='o', label="Final Position", edgecolors='black')

    ax.set_xlabel('X Position (m)', fontsize=12, labelpad=10)
    ax.set_ylabel('Y Position (m)', fontsize=12, labelpad=10)
    ax.set_zlabel('Altitude (m)', fontsize=12, labelpad=10)
    ax.set_title("Rocket Trajectory - 3D Visualization", fontsize=14, pad=20)
    ax.legend(loc='best')

    ax.grid(True, alpha=0.3)

    plt.tight_layout()
    plt.show()


if __name__ == "__main__":
    csv_filepath = '/Users/anasshaw/Downloads/HADESTestData.csv'

    if csv_filepath:
        plot_rocket_trajectory(csv_filepath)
    else:
        print("No file selected")
