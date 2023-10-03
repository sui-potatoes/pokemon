

export type HealthBarProps = {
    initialHp: bigint;
    currentHp: bigint;
}

const HealthBar = ({ initialHp, currentHp }: HealthBarProps) => {

    const percentage = currentHp ? (Number(currentHp) / Number(initialHp)) * 100 : 100;

    const numHearts = 5;
    const filledHearts = Math.ceil((percentage / 100) * numHearts);
    const hearts = [];
  
    for (let i = 0; i < numHearts; i++) {
      const isFilled = i < filledHearts;
  
      hearts.push(
        <svg
          key={i}
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill={isFilled ? 'red' : 'none'}
          stroke="red"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`w-8 h-8 ${isFilled ? 'text-red-500' : 'text-gray-300'}`}
        >
          <path d="M14 20.408c-.492.308-.903.546-1.192.709-.153.086-.308.17-.463.252h-.002a.75.75 0 01-.686 0 16.709 16.709 0 01-.465-.252 31.147 31.147 0 01-4.803-3.34C3.8 15.572 1 12.331 1 8.513 1 5.052 3.829 2.5 6.736 2.5 9.03 2.5 10.881 3.726 12 5.605 13.12 3.726 14.97 2.5 17.264 2.5 20.17 2.5 23 5.052 23 8.514c0 3.818-2.801 7.06-5.389 9.262A31.146 31.146 0 0114 20.408z" />
        </svg>
      );
    }
  
    return (
      <div className="flex items-center space-x-2">
        {hearts}
        <span className="text-xl">{percentage.toFixed(2)}%</span>
      </div>
    );
  };
  
  export default HealthBar;
  

  
  
  
  
  
  
