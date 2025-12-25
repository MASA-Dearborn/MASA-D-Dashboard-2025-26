import numpy as np
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d import Axes3D
from matplotlib.animation import FuncAnimation

# Load the data
data = np.loadtxt('HADESTestData(in).csv', delimiter=',')

x = data[:, 1]  # Horizontal Position X
y = data[:, 2]  # Horizontal Position Y
z = data[:, 0]  # Altitude

# --- 1. Static 3D Rocket Path ---
fig1 = plt.figure(figsize=(10, 7))
ax1 = fig1.add_subplot(111, projection='3d')
ax1.plot(x, y, z, label='Rocket Path', color='blue')
ax1.scatter(x[0], y[0], z[0], color='green', s=50, label='Launch Point')
ax1.scatter(x[-1], y[-1], z[-1], color='red', s=50, label='Final Point')
ax1.set_xlabel('Horizontal X')
ax1.set_ylabel('Horizontal Y')
ax1.set_zlabel('Altitude')
ax1.set_title('3D Rocket Trajectory')
ax1.legend()
plt.show()

# --- 2. Altitude vs Time 2D Plot ---
altitude = z
time = np.arange(len(altitude))
plt.figure()
plt.plot(time, altitude, label='Rocket Altitude')
plt.xlabel('Sample Number (Time Index)')
plt.ylabel('Altitude')
plt.title('Rocket Launch: Altitude vs Time')
plt.grid(True)
plt.legend()
plt.show()

# --- 3. 3D Animated Trajectory ---
fig2 = plt.figure(figsize=(10, 7))
ax2 = fig2.add_subplot(111, projection='3d')

def update(num):
    ax2.clear()
    ax2.plot(x[:num], y[:num], z[:num], color='blue')
    ax2.scatter(x[0], y[0], z[0], color='green', s=50, label='Launch')
    ax2.scatter(x[num-1], y[num-1], z[num-1], color='red', s=50, label='Current')
    ax2.set_xlabel('Horizontal X')
    ax2.set_ylabel('Horizontal Y')
    ax2.set_zlabel('Altitude')
    ax2.set_title("3D Rocket Trajectory Animation")
    ax2.set_xlim([np.min(x), np.max(x)])
    ax2.set_ylim([np.min(y), np.max(y)])
    ax2.set_zlim([np.min(z), np.max(z)])
    ax2.legend()

ani = FuncAnimation(fig2, update, frames=len(x), interval=20, repeat=False)
plt.show()

# --- 4. Speed (gradient) coloring ---
speed = np.gradient(z)
fig3 = plt.figure(figsize=(10, 7))
ax3 = fig3.add_subplot(111, projection='3d')
p = ax3.scatter(x, y, z, c=speed, cmap='plasma', label='Altitude Change Rate')
plt.colorbar(p, ax=ax3, label='Climb Rate')
ax3.set_xlabel('Horizontal X')
ax3.set_ylabel('Horizontal Y')
ax3.set_zlabel('Altitude')
ax3.set_title('Rocket Path Colored by Climb Rate')
plt.show()