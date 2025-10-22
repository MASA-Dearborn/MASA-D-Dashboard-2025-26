import csv
import random
import matplotlib.pyplot as plt

output_file = "piezo_sensor_data.csv"
num_samples = 100


with open(output_file, mode='w', newline='') as file:
    writer = csv.writer(file)
    writer.writerow(['Reading'])
    
    for _ in range(num_samples):
        reading = random.uniform(-2, 2)  
        writer.writerow([reading])

print(f"{num_samples} sensor readings saved to {output_file}.")


readings = []
with open(output_file, mode='r') as file:
    reader = csv.reader(file)
    next(reader) 
    for row in reader:
        if row:
            readings.append(float(row[0]))


plt.figure(figsize=(10, 5))
plt.plot(readings, marker='o', linestyle='-', label="Piezo Sensor Readings")
plt.title("Piezoelectric Sensor Data")
plt.xlabel("Time (seconds)")
plt.ylabel("Sensor Reading")
plt.grid(True)
plt.legend()
plt.show()
